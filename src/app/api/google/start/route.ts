import { NextResponse } from "next/server";
import { consentUrl, googleConfigured } from "@/lib/google";

export const runtime = "nodejs";

/** Sends her to Google and remembers which dashboard link to come back to. */
export function GET(req: Request) {
  if (!googleConfigured())
    return NextResponse.json(
      { ok: false, error: "Google sign-in isn't set up on this deployment yet." },
      { status: 503 },
    );

  const back = new URL(req.url).searchParams.get("back") ?? "/dashboard";
  return NextResponse.redirect(consentUrl(req, Buffer.from(back).toString("base64url")));
}
