import { NextResponse } from "next/server";
import { cutroomAuth, dealsUnlocked, readPeople, readScripts } from "@/lib/cutroom";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The scripts still being made, and who could edit them. */
export async function GET(req: Request) {
  const { creds, deny } = await cutroomAuth(req);
  if (deny) return deny;
  try {
    const [scripts, people] = await Promise.all([
      readScripts(creds.token, dealsUnlocked(req)),
      readPeople(creds.token),
    ]);
    return NextResponse.json({ ok: true, scripts, people, deals: dealsUnlocked(req) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
