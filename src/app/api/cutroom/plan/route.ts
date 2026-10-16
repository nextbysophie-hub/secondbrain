import { NextResponse } from "next/server";
import { askJson, CUT_SYSTEM, cutroomAuth, MATCH_SYSTEM } from "@/lib/cutroom";

export const runtime = "nodejs";
export const maxDuration = 60;

type MatchBody = {
  mode: "match";
  scripts: { id: string; title: string; text: string }[];
  clips: { id: string; name: string; transcript: string }[];
};
type CutBody = {
  mode: "cut";
  script: { title: string; text: string };
  phrases: { id: string; t: string }[];
};

/** The two judgement calls: which script a clip belongs to, and which takes
 *  make the cut. */
export async function POST(req: Request) {
  const { deny } = await cutroomAuth(req);
  if (deny) return deny;
  const body = (await req.json().catch(() => null)) as MatchBody | CutBody | null;
  try {
    if (body?.mode === "match") {
      const scripts = body.scripts
        .map((s) => `## script ${s.id}: ${s.title}\n${s.text.slice(0, 1500)}`)
        .join("\n\n");
      const clips = body.clips
        .map((c) => `## clip ${c.id} (${c.name})\n${c.transcript.slice(0, 2000) || "(no speech)"}`)
        .join("\n\n");
      const reply = await askJson<{ clips?: unknown[] }>(MATCH_SYSTEM, `SCRIPTS\n${scripts}\n\nCLIPS\n${clips}`);
      return NextResponse.json({ ok: true, clips: reply.clips ?? [] });
    }
    if (body?.mode === "cut") {
      const lines = body.script.text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l, i) => `${i + 1}. ${l}`)
        .join("\n");
      const phrases = body.phrases.map((p) => `${p.id}: ${p.t}`).join("\n");
      const reply = await askJson<{ picks?: unknown[]; notes?: string }>(
        CUT_SYSTEM,
        `SCRIPT: ${body.script.title}\n${lines}\n\nRAW PHRASES (clip.phrase: words)\n${phrases}`,
      );
      return NextResponse.json({ ok: true, picks: reply.picks ?? [], notes: reply.notes ?? "" });
    }
    return NextResponse.json({ ok: false, error: "Unknown request." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
