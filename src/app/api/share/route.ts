import { NextResponse } from "next/server";
import { openViewKey, resolveCredentials, sealViewKey } from "@/lib/store";

export const runtime = "nodejs";

/** Turns her own dashboard key into a view-only one she can hand to a friend. */
export async function POST(req: Request) {
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  const own = key?.trim();
  if (!own || own === "demo" || openViewKey(own) || !(await resolveCredentials(own)))
    return NextResponse.json({ ok: false, error: "Only your own dashboard can be shared." }, { status: 401 });
  return NextResponse.json({ ok: true, viewKey: sealViewKey(own) });
}
