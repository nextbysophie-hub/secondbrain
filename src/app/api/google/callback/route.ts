import { NextResponse } from "next/server";
import { CUTROOM_STATE, exchangeCode, GOOGLE_COOKIE, sealRefresh } from "@/lib/google";

export const runtime = "nodejs";

const YEAR = 60 * 60 * 24 * 365;

/** Google hands back a code; it's traded for a refresh token, sealed into a
 *  cookie, and she lands back on the dashboard she came from. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const back = params.get("state")
    ? Buffer.from(params.get("state") as string, "base64url").toString("utf8")
    : "/dashboard";
  const code = params.get("code");

  if (back.startsWith(CUTROOM_STATE)) {
    const port = back.slice(CUTROOM_STATE.length);
    const local = new URL(`http://localhost:${/^\d{2,5}$/.test(port) ? port : "4848"}/drive-connected`);
    const tokens = code ? await exchangeCode(req, code) : null;
    if (tokens?.refresh_token) local.searchParams.set("sealed", sealRefresh(tokens.refresh_token));
    else local.searchParams.set("error", tokens?.error_description ?? "Google didn't connect.");
    return NextResponse.redirect(local);
  }

  const home = new URL(back.startsWith("/") ? back : "/dashboard", req.url);
  if (!code) {
    home.searchParams.set("calendar", "denied");
    return NextResponse.redirect(home);
  }

  const tokens = await exchangeCode(req, code);
  if (!tokens.refresh_token) {
    home.searchParams.set("calendar", "failed");
    return NextResponse.redirect(home);
  }

  const res = NextResponse.redirect(home);
  res.cookies.set(GOOGLE_COOKIE, sealRefresh(tokens.refresh_token), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: YEAR,
  });
  return res;
}
