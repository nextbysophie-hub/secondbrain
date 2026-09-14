import { NextResponse } from "next/server";
import { packCredentials } from "@/lib/store";
import { humanizeNotionError, verifyToken } from "@/lib/notion";

export const runtime = "nodejs";

/** Registers a hosted capture endpoint so the Shortcut only ever posts a key + the idea. */
export async function POST(req: Request) {
  const { token, contentDbId, taskDbId } = (await req.json().catch(() => ({}))) as {
    token?: string;
    contentDbId?: string;
    taskDbId?: string;
  };
  if (!token?.trim() || !contentDbId || !taskDbId) {
    return NextResponse.json({ ok: false, error: "Finish the Notion steps first." }, { status: 400 });
  }
  try {
    await verifyToken(token.trim());
  } catch (e) {
    return NextResponse.json({ ok: false, error: humanizeNotionError(e) }, { status: 400 });
  }

  const captureKey = packCredentials({ token: token.trim(), contentDbId, taskDbId });
  return NextResponse.json({ ok: true, captureKey });
}
