import { findDatabaseLike, memo, notion } from "@/lib/board";

/**
 * The Content Hub: every video from idea to posted (the Content Calendar),
 * the freebies they give away, and the assets the team needs, so a month of
 * posts can be made the month before it goes out.
 */

export type HubVideo = {
  id: string;
  title: string;
  status: string | null;
  type: string | null;
  editor: string | null;
  /** "Carousel", "Yap" or "Talking head" — which slot of the monthly split it fills. */
  format: string | null;
  film: string | null;
  /** The day it goes out ("Post date"). */
  post: string | null;
  turnIn: string | null;
  postUrl: string | null;
  url: string;
};

export type HubFreebie = {
  id: string;
  name: string;
  status: string | null;
  link: string | null;
  keyword: string;
  video: string | null;
  postedOn: string | null;
  notes: string;
  url: string;
};

export type HubAsset = {
  id: string;
  name: string;
  done: boolean;
  link: string | null;
  type: string | null;
  due: string | null;
  url: string;
};

/** A list is null when its Notion database isn't shared with the integration. */
export type Hub = {
  videos: HubVideo[] | null;
  statuses: string[];
  /** Options of the Content Calendar's "Editor?" select. */
  editors: string[];
  freebies: HubFreebie[] | null;
  assets: HubAsset[] | null;
  assetTypes: string[];
};

export const FREEBIE_STATUSES = ["Idea", "Building", "Live", "Posted"];

export type HubAction =
  | { action: "hubVideoStatus"; id: string; status: string }
  | { action: "hubVideoPost"; id: string; date: string | null }
  | { action: "hubVideoFormat"; id: string; format: string | null }
  | { action: "hubVideoEditor"; id: string; editor: string | null }
  | { action: "hubAddVideo"; title: string; status: string; editor?: string | null }
  | {
      action: "hubFreebie";
      id: string;
      field: "status" | "link" | "keyword" | "video" | "postedOn";
      value: string | null;
    }
  | { action: "hubAddFreebie"; name: string }
  | {
      action: "hubAsset";
      id: string;
      field: "done" | "link" | "due";
      value: string | boolean | null;
    }
  | { action: "hubAddAsset"; name: string; type: string | null }
  | { action: "hubArchive"; id: string };

export const isHubAction = (a: { action?: string } | null): a is HubAction =>
  !!a?.action?.startsWith("hub");

type Prop = {
  type?: string;
  title?: { plain_text?: string }[];
  rich_text?: { plain_text?: string }[];
  checkbox?: boolean;
  date?: { start?: string } | null;
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  url?: string | null;
  relation?: { id: string }[];
};
type Row = { id: string; url: string; properties: Record<string, Prop> };

const text = (p?: Prop) =>
  (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim();
const tag = (p?: Prop) => p?.status?.name ?? p?.select?.name ?? null;
const day = (p?: Prop) => p?.date?.start?.slice(0, 10) ?? null;
const titleOf = (r: Row) => {
  const p = Object.values(r.properties).find((x) => x.type === "title");
  return text(p);
};

type HubDbs = { calendar: string | null; freebies: string | null; assets: string | null };
const dbMemo = memo<HubDbs>(10 * 60 * 1000);

/** Pinned by env on the deployment, otherwise found by name. */
function hubDbs(token: string): Promise<HubDbs> {
  return dbMemo(token.slice(-12), async () => {
    const find = (q: string, re: RegExp) => findDatabaseLike(token, q, re).catch(() => null);
    const [calendar, freebies, assets] = await Promise.all([
      process.env.CONTENT_CALENDAR_DB || find("content calendar", /^\s*content calendar\s*$/i),
      process.env.FREEBIES_DB || find("freebies", /^\W*freebies\s*$/i),
      process.env.ASSETS_DB || find("content assets", /^\W*content assets\s*$/i),
    ]);
    return { calendar, freebies, assets };
  });
}

async function rows(token: string, dbId: string, sorts: object[] = []): Promise<Row[]> {
  const out: Row[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await notion<{ results: Row[]; has_more?: boolean; next_cursor?: string | null }>(
      token,
      `/databases/${dbId}/query`,
      {
        method: "POST",
        body: JSON.stringify({ page_size: 100, sorts, ...(cursor ? { start_cursor: cursor } : {}) }),
      },
    );
    out.push(...res.results);
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return out;
}

async function options(token: string, dbId: string, prop: string): Promise<string[]> {
  const db = await notion<{
    properties: Record<string, { type: string; status?: { options: { name: string }[] }; select?: { options: { name: string }[] } }>;
  }>(token, `/databases/${dbId}`);
  const p = db.properties[prop];
  return (p?.status ?? p?.select)?.options.map((o) => o.name) ?? [];
}

async function readVideos(token: string, dbId: string | null) {
  if (!dbId) return { videos: null, statuses: [], editors: [] };
  const [list, statuses, editors] = await Promise.all([
    rows(token, dbId, [{ timestamp: "created_time", direction: "descending" }]),
    options(token, dbId, "Status"),
    options(token, dbId, "Editor?"),
  ]);
  const videos: HubVideo[] = list.map((r) => {
    const p = r.properties;
    return {
      id: r.id,
      title: titleOf(r),
      status: tag(p.Status),
      type: tag(p["Content type"]),
      editor: tag(p["Editor?"]),
      format: tag(p.Format),
      film: day(p["Film date"]),
      post: day(p["Post date"]),
      turnIn: day(p["Turn in Date"]),
      postUrl: p["Post URL"]?.url ?? null,
      url: r.url,
    };
  });
  return { videos: videos.filter((v) => v.title), statuses, editors };
}

async function readFreebies(token: string, dbId: string | null): Promise<HubFreebie[] | null> {
  if (!dbId) return null;
  const list = await rows(token, dbId, [{ timestamp: "created_time", direction: "ascending" }]);
  return list.map((r) => {
    const p = r.properties;
    return {
      id: r.id,
      name: titleOf(r),
      status: tag(p.Status),
      link: p.Link?.url ?? null,
      keyword: text(p.Keyword),
      video: p.Video?.relation?.[0]?.id ?? null,
      postedOn: day(p["Posted on"]),
      notes: text(p.Notes),
      url: r.url,
    };
  });
}

async function readAssets(token: string, dbId: string | null) {
  if (!dbId) return { assets: null, assetTypes: [] };
  const [list, assetTypes] = await Promise.all([
    rows(token, dbId, [{ property: "Due", direction: "ascending" }]),
    options(token, dbId, "Type"),
  ]);
  const assets: HubAsset[] = list.map((r) => ({
    id: r.id,
    name: titleOf(r),
    done: r.properties.Done?.checkbox ?? false,
    link: r.properties.Link?.url ?? null,
    type: tag(r.properties.Type),
    due: day(r.properties.Due),
    url: r.url,
  }));
  return { assets, assetTypes };
}

export async function readHub(token: string): Promise<Hub> {
  const dbs = await hubDbs(token);
  const [v, freebies, a] = await Promise.all([
    readVideos(token, dbs.calendar).catch(() => ({ videos: null, statuses: [], editors: [] })),
    readFreebies(token, dbs.freebies).catch(() => null),
    readAssets(token, dbs.assets).catch(() => ({ assets: null, assetTypes: [] })),
  ]);
  return { ...v, freebies, ...a };
}

const update = (token: string, id: string, properties: object) =>
  notion(token, `/pages/${id}`, { method: "PATCH", body: JSON.stringify({ properties }) });

const create = (token: string, dbId: string | null, properties: object) => {
  if (!dbId) throw { status: 404, message: "That Notion database isn't shared with the dashboard yet." };
  return notion(token, "/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });
};

const rich = (s: string | null) => ({ rich_text: s ? [{ text: { content: s } }] : [] });
const date = (s: string | null) => ({ date: s ? { start: s } : null });
const url = (s: string | null) => ({ url: s?.trim() || null });

export async function applyHubAction(token: string, a: HubAction): Promise<void> {
  const dbs = await hubDbs(token);
  switch (a.action) {
    case "hubVideoStatus":
      await update(token, a.id, { Status: { status: { name: a.status } } });
      return;
    case "hubVideoPost":
      await update(token, a.id, { "Post date": date(a.date) });
      return;
    case "hubVideoFormat":
      await update(token, a.id, { Format: { select: a.format ? { name: a.format } : null } });
      return;
    case "hubVideoEditor":
      await update(token, a.id, { "Editor?": { select: a.editor ? { name: a.editor } : null } });
      return;
    case "hubAddVideo":
      await create(token, dbs.calendar, {
        "Content name": { title: [{ text: { content: a.title } }] },
        Status: { status: { name: a.status } },
        ...(a.editor ? { "Editor?": { select: { name: a.editor } } } : {}),
      });
      return;
    case "hubFreebie": {
      const v = typeof a.value === "string" ? a.value.trim() || null : null;
      const props =
        a.field === "status"
          ? { Status: { select: v ? { name: v } : null } }
          : a.field === "link"
            ? { Link: url(v) }
            : a.field === "keyword"
              ? { Keyword: rich(v) }
              : a.field === "video"
                ? { Video: { relation: v ? [{ id: v }] : [] } }
                : { "Posted on": date(v) };
      await update(token, a.id, props);
      return;
    }
    case "hubAddFreebie":
      await create(token, dbs.freebies, {
        Freebie: { title: [{ text: { content: a.name } }] },
        Status: { select: { name: "Idea" } },
      });
      return;
    case "hubAsset": {
      const props =
        a.field === "done"
          ? { Done: { checkbox: !!a.value } }
          : a.field === "link"
            ? { Link: url(typeof a.value === "string" ? a.value : null) }
            : { Due: date(typeof a.value === "string" ? a.value : null) };
      await update(token, a.id, props);
      return;
    }
    case "hubAddAsset":
      await create(token, dbs.assets, {
        Asset: { title: [{ text: { content: a.name } }] },
        ...(a.type ? { Type: { select: { name: a.type } } } : {}),
      });
      return;
    case "hubArchive":
      await notion(token, `/pages/${a.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
      return;
  }
}
