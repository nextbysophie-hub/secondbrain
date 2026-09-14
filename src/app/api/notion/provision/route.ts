import { NextResponse } from "next/server";
import { humanizeNotionError, provisionDatabases } from "@/lib/notion";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { token, parentPageId } = (await req.json().catch(() => ({}))) as {
    token?: string;
    parentPageId?: string;
  };
  if (!token?.trim() || !parentPageId) {
    return NextResponse.json({ ok: false, error: "Pick the Notion page to build the databases in." }, { status: 400 });
  }
  try {
    const dbs = await provisionDatabases(token.trim(), parentPageId);
    return NextResponse.json({ ok: true, content: dbs.content, task: dbs.task });
  } catch (e) {
    return NextResponse.json({ ok: false, error: humanizeNotionError(e) }, { status: 400 });
  }
}
