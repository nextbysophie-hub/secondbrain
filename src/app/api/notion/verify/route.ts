import { NextResponse } from "next/server";
import { humanizeNotionError, listPages, verifyToken } from "@/lib/notion";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token?.trim()) {
    return NextResponse.json({ ok: false, error: "Paste your Notion key first." }, { status: 400 });
  }
  try {
    const info = await verifyToken(token.trim());
    const pages = await listPages(token.trim());
    return NextResponse.json({ ok: true, ...info, pages });
  } catch (e) {
    return NextResponse.json({ ok: false, error: humanizeNotionError(e) }, { status: 400 });
  }
}
