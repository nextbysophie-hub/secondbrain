import { NextResponse } from "next/server";
import { cutroomAuth, handOff } from "@/lib/cutroom";

export const runtime = "nodejs";

/** Approved: the editor goes on the Notion page, the page moves to editing,
 *  and a comment @mentions them with the Drive folder. */
export async function POST(req: Request) {
  const { creds, deny } = await cutroomAuth(req);
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as {
    pageId?: string;
    editorId?: string | null;
    driveUrl?: string;
    note?: string;
  };
  if (!body.pageId || !body.driveUrl)
    return NextResponse.json({ ok: false, error: "Missing the page or the Drive link." }, { status: 400 });
  try {
    await handOff(creds.token, body.pageId, body.editorId ?? null, body.driveUrl, body.note ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
