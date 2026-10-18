import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleConfigured, GOOGLE_COOKIE, listEvents, openRefresh, refreshAccess } from "@/lib/google";

export const runtime = "nodejs";

/** The events between two moments, for the Events row on each planned day.
 *  The browser sends the range so the days line up with her own clock. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const from = new Date(params.get("from") ?? "");
  const to = new Date(params.get("to") ?? "");
  const timeZone = params.get("tz") || "UTC";
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from)
    return NextResponse.json({ ok: false, error: "That isn't a date range." }, { status: 400 });

  const refresh = openRefresh((await cookies()).get(GOOGLE_COOKIE)?.value);
  if (!refresh)
    return NextResponse.json({ ok: false, connected: false, configured: googleConfigured() });

  const tokens = await refreshAccess(refresh);
  if (!tokens.access_token) {
    const res = NextResponse.json({
      ok: false,
      connected: false,
      configured: true,
      error: "Google signed you out — connect it again.",
    });
    res.cookies.delete(GOOGLE_COOKIE);
    return res;
  }

  try {
    const events = await listEvents(tokens.access_token, from, to, timeZone);
    return NextResponse.json({ ok: true, connected: true, events });
  } catch (e) {
    return NextResponse.json(
      { ok: false, connected: true, error: e instanceof Error ? e.message : "Google wouldn't answer." },
      { status: 400 },
    );
  }
}
