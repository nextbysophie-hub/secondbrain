import { NextResponse } from "next/server";
import { cutroomAuth, transcribe } from "@/lib/cutroom";

export const runtime = "nodejs";
export const maxDuration = 60;

/** One few-minute slice of a clip's audio at a time — Vercel caps a request
 *  at 4.5 MB, so Cut Room sends small mono MP3 chunks. */
export async function POST(req: Request) {
  const { deny } = await cutroomAuth(req);
  if (deny) return deny;
  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json({ ok: false, error: "OpenAI isn't set up on the dashboard." }, { status: 503 });
  try {
    const audio = await req.blob();
    const prompt = new URL(req.url).searchParams.get("prompt") ?? "";
    return NextResponse.json({ ok: true, ...(await transcribe(audio, prompt)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
