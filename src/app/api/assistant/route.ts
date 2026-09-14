import { NextResponse } from "next/server";
import { offlineAnswer } from "@/lib/faq";

export const runtime = "nodejs";

type Msg = { role: "user" | "assistant"; content: string };

const SYSTEM = `You are the friendly setup helper inside a wizard that connects an iPhone to Notion so ideas can be captured by voice.

The setup has these steps: 1) create a Notion integration and paste its key, 2) pick a Notion page and let the wizard auto-create the "Content Ideas" and "To-dos" databases, 3) choose hosting — either a capture link hosted for them, or deploying their own copy to a free Vercel account, 4) build two iOS Shortcuts ("Capture Idea" and "Capture To-do") that POST {"idea": "...", "type": "content"|"task"} to their capture link, 5) send a test capture.

Rules:
- The person you are talking to is NOT technical. Never assume they know what an API, JSON, environment variable, or deployment is. Explain with everyday comparisons.
- Keep answers under 90 words. No code blocks unless they explicitly ask for code.
- Be warm and calm. Never make them feel stupid for asking.
- If they paste an error, tell them plainly what it means and the single next thing to click.
- Never invent Notion or Vercel menu items you're unsure about; if unsure, say what to look for instead.`;

export async function POST(req: Request) {
  const { messages, stepTitle } = (await req.json().catch(() => ({}))) as {
    messages?: Msg[];
    stepTitle?: string;
  };
  const history = Array.isArray(messages) ? messages.slice(-10) : [];
  const latest = history.filter((m) => m.role === "user").pop()?.content ?? "";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, answer: offlineAnswer(latest), source: "offline" });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM },
          ...(stepTitle ? [{ role: "system" as const, content: `They are currently on the step: "${stepTitle}".` }] : []),
          ...history,
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const answer = json.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("empty completion");
    return NextResponse.json({ ok: true, answer, source: "ai" });
  } catch {
    return NextResponse.json({ ok: true, answer: offlineAnswer(latest), source: "offline" });
  }
}
