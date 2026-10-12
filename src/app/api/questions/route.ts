import { NextResponse } from "next/server";
import { AskedQuestion, DraftedQuestion, draftFor, subjectFor } from "@/lib/questions";

export const runtime = "nodejs";

const base = () => (process.env.QUESTIONS_API || "https://nextbysophie-newsletter.vercel.app").replace(/\/$/, "");
const code = () => process.env.HQ_PASSCODE?.trim() ?? "";

/** Unanswered questions from nextbysophie.com/answers, each with a reply
 *  drafted in Sophie's voice. Drafts are made once per request and cached by
 *  the client, so a reload re-drafts. */
export async function GET() {
  if (!code()) return NextResponse.json({ ok: true, questions: [], configured: false });
  const res = await fetch(`${base()}/api/questions`, { headers: { "X-HQ-Code": code() }, cache: "no-store" });
  if (!res.ok) return NextResponse.json({ ok: false, error: `Questions feed ${res.status}` }, { status: 502 });
  const json = (await res.json()) as { questions?: AskedQuestion[] };
  const list = (json.questions ?? []).slice(0, 8);
  const drafted: DraftedQuestion[] = await Promise.all(
    list.map(async (q) => ({ ...q, subject: subjectFor(q), ...(await draftFor(q)) })),
  );
  return NextResponse.json({ ok: true, configured: true, questions: drafted });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; answered?: boolean };
  if (!body.id || !code()) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${base()}/api/questions`, {
    method: "POST",
    headers: { "X-HQ-Code": code(), "Content-Type": "application/json" },
    body: JSON.stringify({ id: body.id, answered: body.answered !== false }),
  });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
}
