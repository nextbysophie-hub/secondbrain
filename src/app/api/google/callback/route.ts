import { NextResponse } from "next/server";
import { exchangeCode, GOOGLE_COOKIE, sealRefresh } from "@/lib/google";

export const runtime = "nodejs";

const YEAR = 60 * 60 * 24 * 365;

/** Google hands back a code; it's traded for a refresh token, sealed into a
 *  cookie, and she lands back on the dashboard she came from. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const back = params.get("state")
    ? Buffer.from(params.get("state") as string, "base64url").toString("utf8")
    : "/dashboard";
  const home = new URL(back.startsWith("/") ? back : "/dashboard", req.url);

  const code = params.get("code");
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
