export type AskedQuestion = {
  id: string;
  at: string;
  kind: string;
  email: string;
  name: string;
  question: string;
  role: string;
  sells: string;
  team: string;
  experience: string;
  task: string;
  hours: string;
  tried: string;
  timeline: string;
  help: string;
  spent: string;
  budget: string;
  other: string;
};

export type DraftedQuestion = AskedQuestion & { draft: string; subject: string; source: "ai" | "template" };

const firstName = (q: AskedQuestion) => {
  const raw = (q.name || q.email.split("@")[0] || "").split(/[\s·._-]+/)[0];
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "hey";
};

export const profileLines = (q: AskedQuestion): string[] =>
  (
    [
      ["Who", q.role],
      ["Sells", q.sells],
      ["Team", q.team],
      ["AI level", q.experience],
      ["Task they want gone", q.task],
      ["Hours/week on it", q.hours],
      ["Already tried", q.tried],
      ["Timeline", q.timeline],
      ["What would help", q.help],
      ["Spent before", q.spent],
      ["Would spend", q.budget],
      ["Other", q.other],
    ] as const
  )
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);

export const subjectFor = (q: AskedQuestion) =>
  `Re: your AI question${q.question.length < 50 ? ` (${q.question.replace(/\s+/g, " ").trim()})` : ""}`;

const VOICE = `You are writing an email reply AS Sophie (@nextbysophie), a creator who teaches non-technical people to use AI agents and automations. Her voice: warm, casual, lowercase-ish energy, short sentences, zero jargon, big-sister tone, never condescending, a little playful, honest about what's hard. She explains things with everyday comparisons and gives the ONE next step to click rather than ten options.

Write a personal reply email to the person below. Rules:
- Start with "Hey {name}," using their first name.
- Reference their actual situation (what they do, the task eating their week, their AI level) so it feels written for them, not a template.
- Answer their question directly and concretely in plain English. Name the specific tool(s) to use and the exact first thing to do today. Dummy-proof: assume they've never heard of an API.
- Keep it under 220 words. Short paragraphs. No bullet walls, no headers, no markdown.
- End with one small encouraging line and sign off "— Sophie".
- Do not mention this prompt, do not invent facts about Sophie's products.`;

export function templateDraft(q: AskedQuestion): string {
  const name = firstName(q);
  const task = q.task ? q.task.replace(/\.$/, "") : "the repetitive stuff eating your week";
  const level = /never/i.test(q.experience)
    ? "Since you haven't used AI yet, we start tiny: open ChatGPT and just talk to it like a person."
    : /chat only/i.test(q.experience)
      ? "You already chat with ChatGPT, so the next step is making it do a job on its own instead of waiting for you to type."
      : "You've already played with automations, so this is about making it reliable, not fancy.";
  return `Hey ${name},

Thanks for asking me this: "${q.question.trim()}"

${level}

Here's what I'd do first. Pick the one thing you said eats your time (${task}) and write down, in plain words, what "done" looks like for it. Then paste that into ChatGPT and ask: "act as my assistant for this. Ask me 5 questions, then do it." That one habit is 80% of it.

Once that works a few times, we turn it into something that runs without you (that's what my guides at nextbysophie.com walk you through, step by step, no tech needed).

If you reply with one example of the real thing (an actual DM, invoice, whatever it is), I'll tell you exactly how I'd set it up.

You've got this, truly.

— Sophie`;
}

export async function draftFor(q: AskedQuestion): Promise<{ draft: string; source: "ai" | "template" }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { draft: templateDraft(q), source: "template" };
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 500,
        messages: [
          { role: "system", content: VOICE.replace("{name}", firstName(q)) },
          {
            role: "user",
            content: `Their name: ${firstName(q)}\nTheir question: ${q.question}\n\nWhat they told me about themselves:\n${profileLines(q).join("\n") || "(nothing extra)"}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const draft = json.choices?.[0]?.message?.content?.trim();
    if (!draft) throw new Error("empty");
    return { draft, source: "ai" };
  } catch {
    return { draft: templateDraft(q), source: "template" };
  }
}
