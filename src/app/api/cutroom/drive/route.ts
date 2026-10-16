import { NextResponse } from "next/server";
import { cutroomAuth } from "@/lib/cutroom";
import { openRefresh, refreshAccess } from "@/lib/google";

export const runtime = "nodejs";

/** Cut Room keeps only the sealed refresh token; the Google secret stays here
 *  and it trades the seal for an hour-long access token whenever it uploads. */
export async function POST(req: Request) {
  const { deny } = await cutroomAuth(req);
  if (deny) return deny;
  const { sealed } = (await req.json().catch(() => ({}))) as { sealed?: string };
  const refresh = openRefresh(sealed);
  if (!refresh) return NextResponse.json({ ok: false, error: "Reconnect Google Drive." }, { status: 401 });
  const tokens = await refreshAccess(refresh);
  if (!tokens.access_token)
    return NextResponse.json({ ok: false, error: tokens.error_description ?? "Reconnect Google Drive." }, { status: 401 });
  return NextResponse.json({ ok: true, accessToken: tokens.access_token });
}
