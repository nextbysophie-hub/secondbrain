import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Runs the same request the Shortcut makes, from the server, so a phone that can't
 *  reach the webhook can still find out whether the link itself is good. */
export async function POST(req: Request) {
  const { url, idea } = (await req.json().catch(() => ({}))) as { url?: string; idea?: string };
  const target = url?.trim();
  if (!target) return NextResponse.json({ ok: false, error: "Paste your capture link first." }, { status: 400, headers: CORS });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json(
      { ok: false, reachable: false, error: "That isn't a complete web address. It has to start with https://" },
      { headers: CORS },
    );
  }
  if (parsed.protocol !== "https:") {
    return NextResponse.json(
      { ok: false, reachable: false, error: "The link has to start with https:// — http on its own will fail on iPhone." },
      { headers: CORS },
    );
  }

  try {
    const res = await fetch(parsed.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: idea?.trim() || "Test from the checker", type: "content", source: "Checker" }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let payload: { ok?: boolean; error?: string; url?: string } = {};
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      payload = {};
    }
    return NextResponse.json(
      {
        ok: res.ok && payload.ok !== false,
        reachable: true,
        status: res.status,
        error: payload.error,
        pageUrl: payload.url,
        raw: text.slice(0, 400),
      },
      { headers: CORS },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        reachable: false,
        error: `Nothing answered at that address (${e instanceof Error ? e.message : "no response"}). The address is probably wrong or that deployment is gone.`,
      },
      { headers: CORS },
    );
  }
}
