import { NextResponse } from "next/server";
import { DB_DEFAULTS, capture, humanizeNotionError } from "@/lib/notion";
import { resolveCredentials } from "@/lib/store";

export const runtime = "nodejs";

type Body = {
  idea?: string;
  type?: string;
  link?: string;
  note?: string;
  source?: string;
  due?: string;
  key?: string;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * The due date is spoken to Siri, so it arrives as whatever the person said —
 * "tomorrow", "friday", "in 3 days". Anything unparseable is dropped rather than
 * failing the whole capture.
 */
function normalizeDue(raw: string | undefined): string | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value || /^(no|none|skip|nothing|na|n\/a|-)$/i.test(value)) return undefined;

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const shift = (days: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + days);
    return iso(d);
  };

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value === "today" || value === "tonight") return iso(today);
  if (value === "tomorrow") return shift(1);
  if (/next week/.test(value)) return shift(7);

  const inDays = value.match(/in (\d+) days?/);
  if (inDays) return shift(Number(inDays[1]));

  const day = DAYS.findIndex((d) => value.includes(d));
  if (day >= 0) {
    const ahead = (day - today.getUTCDay() + 7) % 7 || 7;
    return shift(/next/.test(value) && ahead < 7 ? ahead + 7 : ahead);
  }

  const parsed = new Date(raw!.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : iso(parsed);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * "It isn't set up" covers several very different mistakes, and the person is
 * staring at a phone with no way to inspect the request — so name the one they made.
 */
function explainMissingKey(key: string | undefined): string {
  if (!key) {
    return "No key came through. In Get Contents of URL, either paste your whole capture link (the long one ending in ?key=…) into the URL box, or add a Text field named exactly \"key\" to the JSON body with your key as its value. Careful: the shortcut has two Get Contents of URL actions — a Siri run uses the one in the Otherwise branch.";
  }
  if (/paste|your[_ -]?key|here/i.test(key)) {
    return "The key is still the placeholder. Tap the Text action at the top of the shortcut, delete PASTE_YOUR_KEY_HERE, and paste your own key from the wizard.";
  }
  if (key.toLowerCase().startsWith("key=") || key.includes("http")) {
    return "The key value has extra text in it. It should be only the part after \"key=\" — no \"key=\", no https://, nothing else.";
  }
  if (key.length < 120) {
    return `Only ${key.length} characters of the key arrived, and a real one is around 280 — it got cut off when pasted. Copy it again from the wizard and paste the whole thing.`;
  }
  return "The key arrived but couldn't be read — usually a character got lost or a line break slipped in when pasting. Copy it fresh from the wizard, or use \"Start over\" to generate a new capture link.";
}

/** Opening the capture link in a browser should explain itself rather than 405. */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") || undefined;
  const creds = await resolveCredentials(key);
  return NextResponse.json(
    creds
      ? {
          ok: true,
          message:
            "This capture link is valid. If you got here by scanning the QR code: the thing you need is the address at the top of this screen — tap and hold the address bar and choose Copy, then paste it into your Shortcut.",
        }
      : {
          ok: false,
          message: "This link isn't carrying working credentials. Run the setup wizard again to get a fresh one.",
        },
    { status: creds ? 200 : 401, headers: CORS },
  );
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "The Shortcut sent something that wasn't JSON." }, { status: 400, headers: CORS });
  }

  const idea = body.idea?.trim();
  if (!idea) {
    return NextResponse.json({ ok: false, error: "No idea text came through." }, { status: 400, headers: CORS });
  }

  const key = body.key?.trim() || new URL(req.url).searchParams.get("key")?.trim() || undefined;
  const creds = await resolveCredentials(key);
  if (!creds) {
    return NextResponse.json({ ok: false, error: explainMissingKey(key) }, { status: 401, headers: CORS });
  }

  // "series" is the old name for the second database, kept so Shortcuts built
  // before the rename keep working.
  const kind = body.type === "task" || body.type === "series" ? "task" : "content";
  const defaults = DB_DEFAULTS[kind];
  const dbId = kind === "task" ? creds.taskDbId : creds.contentDbId;

  try {
    const page = await capture(creds.token, { ...defaults, id: dbId }, {
      idea,
      link: body.link?.trim() || undefined,
      note: body.note?.trim() || undefined,
      source: body.source?.trim() || "Siri",
      due: normalizeDue(body.due),
    });
    return NextResponse.json({ ok: true, message: "Captured", url: page.url }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ ok: false, error: humanizeNotionError(e) }, { status: 400, headers: CORS });
  }
}
