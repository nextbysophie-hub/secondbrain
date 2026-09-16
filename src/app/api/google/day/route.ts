import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { busyMinutes, googleConfigured, GOOGLE_COOKIE, openRefresh, refreshAccess } from "@/lib/google";

export const runtime = "nodejs";

/** How much of the working day is actually still hers. The browser says when
 *  its day starts and ends, because only it knows her clock. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const from = new Date(params.get("from") ?? "");
  const to = new Date(params.get("to") ?? "");
  const timeZone = params.get("tz") || "UTC";
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from)
    return NextResponse.json({ ok: false, error: "That isn't a working day." }, { status: 400 });

  const refresh = openRefresh((await cookies()).get(GOOGLE_COOKIE)?.value);
  if (!refresh)
    return NextResponse.json({ ok: false, connected: false, configured: googleConfigured() });

  const tokens = await refreshAccess(refresh);
  if (!tokens.access_token) {
    // Google drops the connection every so often; say so plainly instead of
    // showing a stale number.
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
    const busy = await busyMinutes(tokens.access_token, from, to, timeZone);
    const span = Math.round((to.getTime() - from.getTime()) / 60000);
    return NextResponse.json({ ok: true, connected: true, busy, free: Math.max(0, span - busy) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, connected: true, error: e instanceof Error ? e.message : "Google wouldn't answer." },
      { status: 400 },
    );
  }
}
