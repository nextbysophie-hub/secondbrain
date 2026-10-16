import { NextResponse } from "next/server";
import { consentUrl, CUTROOM_STATE, DRIVE_SCOPE, googleConfigured } from "@/lib/google";

export const runtime = "nodejs";

/** Sends her to Google and remembers which dashboard link to come back to. */
export function GET(req: Request) {
  if (!googleConfigured())
    return NextResponse.json(
      { ok: false, error: "Google sign-in isn't set up on this deployment yet." },
      { status: 503 },
    );

  const params = new URL(req.url).searchParams;
  const port = params.get("cutroom");
  if (port && /^\d{2,5}$/.test(port))
    return NextResponse.redirect(
      consentUrl(req, Buffer.from(CUTROOM_STATE + port).toString("base64url"), DRIVE_SCOPE),
    );

  const back = params.get("back") ?? "/dashboard";
  return NextResponse.redirect(consentUrl(req, Buffer.from(back).toString("base64url")));
}
