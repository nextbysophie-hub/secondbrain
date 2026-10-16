/**
 * Server side of Cut Room, the Mac app that turns raw footage into rough cuts.
 * The heavy work (copying clips, ffmpeg) happens on her computer; this side
 * holds the keys it shouldn't have to: Notion, OpenAI and the Google secret.
 */
import { NextResponse } from "next/server";
import { resolveCredentials } from "@/lib/store";

const NOTION = "https://api.notion.com/v1";

export async function notion<T>(token: string, endpoint: string, init?: RequestInit): Promise<T> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${NOTION}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (res.status !== 429 || attempt >= 4) break;
    const after = Number(res.headers.get("retry-after")) || 1;
    await new Promise((r) => setTimeout(r, Math.min(after, 5) * 1000 + 200));
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof body.message === "string" ? body.message : `Notion ${res.status}`);
  return body as T;
}

/** Every Cut Room call carries the dashboard link's key, so a stranger can't
 *  spend her OpenAI credit or comment on her pages. */
export async function cutroomAuth(req: Request) {
  const key = new URL(req.url).searchParams.get("key")?.trim() || req.headers.get("x-cutroom-key")?.trim();
  const creds = key && key !== "demo" ? await resolveCredentials(key) : null;
  if (!creds)
    return {
      creds: null,
      deny: NextResponse.json({ ok: false, error: "That dashboard link isn't working. Paste it again in Cut Room." }, { status: 401 }),
    } as const;
  return { creds, deny: null } as const;
}

/** Brand terms sit in the deals notes, so deal scripts need the same passcode
 *  as the deals wall. */
export const dealsUnlocked = (req: Request) => {
  const code = process.env.DEALS_PASSCODE?.trim();
  if (!code) return true;
  return (req.headers.get("x-deals-code") ?? "").trim() === code;
};

type RichText = { plain_text?: string };
type Prop = {
  type: string;
  title?: RichText[];
  rich_text?: RichText[];
  status?: { name?: string } | null;
  select?: { name?: string } | null;
  people?: { id: string; name?: string; person?: { email?: string } }[];
};
type Page = { id: string; url: string; properties: Record<string, Prop> };

const plain = (p?: Prop) =>
  ((p?.type === "title" ? p.title : p?.rich_text) ?? []).map((t) => t.plain_text ?? "").join("").trim();
const choice = (p?: Prop) => (p?.status ?? p?.select)?.name ?? null;

export type Person = { id: string; name: string; email: string | null };
export type Script = {
  id: string;
  source: "content" | "deal";
  title: string;
  stage: string | null;
  url: string;
  editor: Person | null;
  text: string;
};

export const EDITOR_PROP = "Editor";

/** Stages that mean "still being made" — scripts outside them are either
 *  ideas nobody wrote yet or videos that are already out. */
const LIVE_CONTENT = /drafting|filming|editing|script/i;
const LIVE_DEAL = /script|film|edit|signed/i;

async function findDb(token: string, query: string, match: RegExp): Promise<string | null> {
  const res = await notion<{ results: { id: string; title?: RichText[] }[] }>(token, "/search", {
    method: "POST",
    body: JSON.stringify({ query, filter: { value: "database", property: "object" }, page_size: 20 }),
  });
  return res.results.find((d) => match.test((d.title ?? []).map((t) => t.plain_text ?? "").join("")))?.id ?? null;
}

export async function scriptDbs(token: string) {
  const [calendar, content, deals] = await Promise.all([
    process.env.CONTENT_CALENDAR_DB || findDb(token, "content calendar", /^\s*content calendar\s*$/i),
    process.env.CONTENT_IDEAS_DB || findDb(token, "content ideas", /^\s*content ideas\s*$/i),
    findDb(token, "brand deals", /brand\s*deals?/i),
  ]);
  return { calendar, content, deals };
}

/** The Content Calendar may sit behind a different Notion connection than the
 *  dashboard's own, so the server keeps one that can always reach it. */
const fallbackToken = () => process.env.CUTROOM_NOTION_TOKEN?.trim() || null;

async function tokenFor(token: string, path: string): Promise<string> {
  try {
    await notion(token, path);
    return token;
  } catch (e) {
    const fb = fallbackToken();
    if (!fb || fb === token) throw e;
    await notion(fb, path);
    return fb;
  }
}

/** An editor is a person, and Notion only pings people from a people column. */
async function ensureEditorColumn(token: string, dbId: string) {
  const db = await notion<{ properties: Record<string, Prop> }>(token, `/databases/${dbId}`);
  if (db.properties[EDITOR_PROP]) return db.properties;
  await notion(token, `/databases/${dbId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { [EDITOR_PROP]: { people: {} } } }),
  });
  return db.properties;
}

async function queryAll(token: string, dbId: string): Promise<Page[]> {
  const out: Page[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const res = await notion<{ results: Page[]; has_more: boolean; next_cursor: string | null }>(
      token,
      `/databases/${dbId}/query`,
      { method: "POST", body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }) },
    );
    out.push(...res.results);
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return out;
}

type Block = { id: string; type: string; has_children?: boolean } & Record<string, unknown>;

/** The script is whatever she wrote on the page itself — paragraphs, bullets,
 *  headings — one line per block. */
async function pageText(token: string, pageId: string, depth = 0): Promise<string> {
  const lines: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const res = await notion<{ results: Block[]; has_more: boolean; next_cursor: string | null }>(
      token,
      `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
    );
    for (const b of res.results) {
      const body = b[b.type] as { rich_text?: RichText[] } | undefined;
      const text = (body?.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim();
      if (text) lines.push(text);
      if (b.has_children && depth < 2 && b.type !== "child_page" && b.type !== "child_database")
        lines.push(await pageText(token, b.id, depth + 1));
    }
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return lines.filter(Boolean).join("\n");
}

const personOf = (p?: Prop): Person | null => {
  const who = p?.people?.[0];
  return who ? { id: who.id, name: who.name ?? "Editor", email: who.person?.email ?? null } : null;
};

export async function readScripts(token: string, withDeals: boolean): Promise<Script[]> {
  const dbs = await scriptDbs(token);
  const scripts: Script[] = [];

  // Her real scripts: the Content Calendar, one page body per video. Its
  // editors are a name select, so it doesn't get an extra people column.
  const calToken = dbs.calendar ? await tokenFor(token, `/databases/${dbs.calendar}`).catch(() => null) : null;
  if (dbs.calendar && calToken) {
    const rows = (await queryAll(calToken, dbs.calendar)).filter((r) => LIVE_CONTENT.test(choice(r.properties.Status) ?? ""));
    const bodies = await Promise.all(rows.map((r) => pageText(calToken, r.id).catch(() => "")));
    rows.forEach((r, i) => {
      const p = r.properties;
      const titleProp = Object.values(p).find((x) => x.type === "title");
      scripts.push({
        id: r.id,
        source: "content",
        title: plain(titleProp) || "Untitled",
        stage: choice(p.Status),
        url: r.url,
        editor: personOf(p[EDITOR_PROP]),
        text: bodies[i],
      });
    });
  }

  if (dbs.content) {
    await ensureEditorColumn(token, dbs.content);
    const rows = (await queryAll(token, dbs.content)).filter((r) => LIVE_CONTENT.test(choice(r.properties.Status) ?? ""));
    for (const r of rows) {
      const p = r.properties;
      const titleProp = Object.values(p).find((x) => x.type === "title");
      const fields = [
        ["Hook", plain(p.Hook)],
        ["Angle", plain(p.Angle)],
        ["Outline", plain(p["Notes / Outline"])],
        ["CTA", plain(p.CTA)],
      ]
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`);
      const body = await pageText(token, r.id);
      scripts.push({
        id: r.id,
        source: "content",
        title: plain(titleProp) || "Untitled",
        stage: choice(p.Status),
        url: r.url,
        editor: personOf(p[EDITOR_PROP]),
        text: [...fields, body].filter(Boolean).join("\n"),
      });
    }
  }

  if (withDeals && dbs.deals) {
    const props = await ensureEditorColumn(token, dbs.deals);
    const stageProp =
      Object.keys(props).find((k) => /production/i.test(k)) ??
      Object.keys(props).find((k) => /stage|status/i.test(k));
    const notesProp = Object.keys(props).find((k) => props[k].type === "rich_text" && /note|brief|script/i.test(k));
    const rows = (await queryAll(token, dbs.deals)).filter((r) => {
      const stage = stageProp ? choice(r.properties[stageProp]) ?? "" : "";
      return LIVE_DEAL.test(stage) && !/deliver|passed/i.test(stage);
    });
    for (const r of rows) {
      const p = r.properties;
      const titleProp = Object.values(p).find((x) => x.type === "title");
      const body = await pageText(token, r.id);
      scripts.push({
        id: r.id,
        source: "deal",
        title: plain(titleProp) || "Untitled deal",
        stage: stageProp ? choice(p[stageProp]) : null,
        url: r.url,
        editor: personOf(p[EDITOR_PROP]),
        text: [notesProp ? plain(p[notesProp]) : "", body].filter(Boolean).join("\n"),
      });
    }
  }
  return scripts.filter((s) => s.text.length >= 20);
}

export async function readPeople(token: string): Promise<Person[]> {
  const res = await notion<{ results: { id: string; type: string; name?: string; person?: { email?: string } }[] }>(
    token,
    "/users?page_size=100",
  );
  return res.results
    .filter((u) => u.type === "person")
    .map((u) => ({ id: u.id, name: u.name ?? "Someone", email: u.person?.email ?? null }));
}

/** Approving a cut sets the editor on the page, moves it to the editing stage
 *  and leaves a comment that @mentions them, which is what makes Notion send
 *  them the notification. */
export async function handOff(
  token: string,
  pageId: string,
  editorId: string | null,
  driveUrl: string,
  note: string,
) {
  token = await tokenFor(token, `/pages/${pageId}`);
  const page = await notion<{ properties: Record<string, Prop & { id: string }>; parent: { database_id?: string } }>(
    token,
    `/pages/${pageId}`,
  );
  const props: Record<string, unknown> = {};
  if (editorId && page.properties[EDITOR_PROP]) props[EDITOR_PROP] = { people: [{ id: editorId }] };

  if (page.parent.database_id) {
    const db = await notion<{ properties: Record<string, { type: string; status?: { options: { name: string }[] }; select?: { options: { name: string }[] } }> }>(
      token,
      `/databases/${page.parent.database_id}`,
    );
    const stageName =
      Object.keys(db.properties).find((k) => /production/i.test(k)) ??
      Object.keys(db.properties).find((k) => db.properties[k].type === "status");
    const stage = stageName ? db.properties[stageName] : undefined;
    const kind = stage?.type === "status" ? "status" : stage?.type === "select" ? "select" : null;
    const option = kind && (stage?.[kind]?.options ?? []).find((o) => /edit/i.test(o.name))?.name;
    if (stageName && kind && option) props[stageName] = { [kind]: { name: option } };
  }
  if (Object.keys(props).length)
    await notion(token, `/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ properties: props }) });

  const rich: unknown[] = [];
  if (editorId) rich.push({ type: "mention", mention: { user: { id: editorId } } }, { type: "text", text: { content: " " } });
  rich.push(
    { type: "text", text: { content: `${note || "Rough cut approved — ready for you to edit."} ` } },
    { type: "text", text: { content: "Footage + rough cut in Drive", link: { url: driveUrl } } },
  );
  // Comments need an extra Notion permission; a mention on the page itself
  // pings them just the same.
  await notion(token, "/comments", { method: "POST", body: JSON.stringify({ parent: { page_id: pageId }, rich_text: rich }) }).catch(() =>
    notion(token, `/blocks/${pageId}/children`, {
      method: "PATCH",
      body: JSON.stringify({
        children: [{ object: "block", type: "callout", callout: { rich_text: rich, icon: { type: "emoji", emoji: "🎬" }, color: "yellow_background" } }],
      }),
    }),
  );
}

/** Whisper with word timings: the cut points come from where each word starts
 *  and ends, not from whole sentences. */
export async function transcribe(audio: Blob, prompt: string) {
  const form = new FormData();
  form.set("file", audio, "audio.mp3");
  form.set("model", "whisper-1");
  form.set("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  if (prompt) form.set("prompt", prompt.slice(0, 800));
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as {
    text?: string;
    language?: string;
    duration?: number;
    words?: { word: string; start: number; end: number }[];
    segments?: { start: number; end: number; text: string }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(body.error?.message ?? `Transcription failed (${res.status})`);
  return {
    text: body.text ?? "",
    language: body.language ?? null,
    words: (body.words ?? []).map((w) => ({ w: w.word, s: w.start, e: w.end })),
    segments: (body.segments ?? []).map((s) => ({ s: s.start, e: s.end, t: s.text.trim() })),
  };
}

export async function askJson<T>(system: string, user: string): Promise<T> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.CUTROOM_MODEL || "gpt-4.1",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(body.error?.message ?? `OpenAI ${res.status}`);
  return JSON.parse(body.choices?.[0]?.message?.content ?? "{}") as T;
}

export const MATCH_SYSTEM = `You match raw video clips to the scripts they were filmed for.
Each clip is a creator talking to camera; its transcript may be a full take, part of a take, several retakes, or unrelated (B-roll chatter, testing the mic).
For every clip, pick the script id whose words or ideas it is clearly performing, or null if none fits. Paraphrasing counts — creators rarely read word for word, and the language may differ from the script.
Reply as JSON: {"clips":[{"clip":"<clip id>","script":"<script id or null>","confidence":0-1,"why":"<6 words max>"}]}`;

export const CUT_SYSTEM = `You are a video editor making a rough cut of a talking-head video from raw takes.
You get the script (numbered lines) and every phrase spoken in the raw clips, each with an id like c2.p14.
Build the video in script order: for each script line, choose the single best COMPLETE delivery — usually the LAST clean take, since creators repeat a line until it's right. Skip false starts, stumbles, repeated lines, "let me do that again", counting, off-script chatter and silence.
Ad-libs that fit the script's point can stay. If a line was never said, skip it. A pick is a contiguous run of phrases from ONE clip.
Reply as JSON: {"picks":[{"line":<script line number>,"from":"c2.p14","to":"c2.p16"}],"notes":"<one sentence for the creator about anything missing or shaky>"}
Picks must be in final playback order. Never repeat the same content twice.`;
