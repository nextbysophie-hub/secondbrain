import { NextResponse } from "next/server";
import { resolveCredentials } from "@/lib/store";

export const runtime = "nodejs";

export type ProjectStep = { title: string; minutes: number; deep: boolean };

const SYSTEM = `You turn a project into a short, ordered list of tasks for a busy content creator's to-do list.

Rules:
- 4 to 12 tasks, in the order they should be done.
- Each task is one sitting: something she can finish in 2 hours or less. Split anything bigger.
- Each title starts with a verb and is under 70 characters. Concrete, not vague ("Write the 3 hook options", not "Work on hooks").
- "minutes" is an honest estimate of how long it takes.
- "deep" is true for focused work (writing, filming, editing, building, thinking) that needs 45+ minutes of attention; false for quick admin (emails, booking, sending, buying).
- "name" is a short, fun quest name for the whole project, 2 to 5 words, no emoji.
- Reply only with JSON: {"name":"...","tasks":[{"title":"...","minutes":60,"deep":true}]}`;

const DEMO: ProjectStep[] = [
  { title: "Outline the video and the one takeaway", minutes: 45, deep: true },
  { title: "Write the script and the 3 hook options", minutes: 90, deep: true },
  { title: "Book the studio for filming day", minutes: 10, deep: false },
  { title: "Film the A-roll and b-roll", minutes: 120, deep: true },
  { title: "Edit the first cut", minutes: 120, deep: true },
  { title: "Send the cut to Millie for notes", minutes: 10, deep: false },
  { title: "Make the thumbnail and write the caption", minutes: 45, deep: true },
  { title: "Schedule the post", minutes: 10, deep: false },
];

export async function POST(req: Request) {
  const { project, by, key } = (await req.json().catch(() => ({}))) as {
    project?: string;
    by?: string | null;
    key?: string;
  };
  const text = project?.trim().slice(0, 2000);
  if (!text) return NextResponse.json({ ok: false, error: "Type the project first." }, { status: 400 });
  if (key?.trim() === "demo")
    return NextResponse.json({ ok: true, name: "The Morning Routine Video", tasks: DEMO });
  if (!(await resolveCredentials(key?.trim() || undefined)))
    return NextResponse.json({ ok: false, error: "Open your dashboard link again." }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "The AI isn't set up yet." }, { status: 500 });

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Project: ${text}${by ? `\nIt needs to be finished by ${by}.` : ""}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as {
      name?: string;
      tasks?: Partial<ProjectStep>[];
    };
    const tasks = (parsed.tasks ?? [])
      .filter((t) => typeof t.title === "string" && t.title.trim())
      .slice(0, 15)
      .map((t) => ({
        title: (t.title as string).trim().slice(0, 120),
        minutes: Math.max(5, Math.min(240, Math.round(Number(t.minutes) || 30))),
        deep: !!t.deep,
      }));
    if (!tasks.length) throw new Error("no tasks");
    const name = typeof parsed.name === "string" ? parsed.name.trim().slice(0, 60) : "";
    return NextResponse.json({ ok: true, name: name || text.slice(0, 40), tasks });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't chop that up just now — try again." }, { status: 502 });
  }
}
