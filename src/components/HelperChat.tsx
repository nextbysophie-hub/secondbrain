"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "./ui";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "What even is Vercel?",
  "Is my Notion key safe?",
  "It didn't show up in Notion",
  "Explain this step like I'm 5",
];

export function HelperChat({ stepTitle }: { stepTitle: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, stepTitle }),
      });
      const json = (await res.json()) as { answer?: string };
      setMessages([...next, { role: "assistant", content: json.answer ?? "Sorry, I glitched. Ask me again?" }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "I couldn't reach my brain just then. Try once more?" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-accent/40 bg-panel-2/95 px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur hover:border-accent"
      >
        <span aria-hidden>{open ? "\u2715" : "\u{1F4AC}"}</span>
        {open ? "Close" : "Stuck? Ask me"}
      </button>

      {open ? (
        <div className="fixed bottom-20 right-5 z-40 flex h-[min(70vh,560px)] w-[min(92vw,400px)] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl slide-in">
          <div className="border-b border-line px-4 py-3">
            <div className="text-sm font-bold">Your setup buddy</div>
            <div className="text-[12px] text-muted">No question is too basic. Seriously.</div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-[14px] leading-relaxed text-muted">
                  I know every step of this setup. Ask me anything, or tap one of these:
                </p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-line bg-panel-2 px-3 py-2 text-[13px] hover:border-accent/60"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto bg-accent/20 text-ink"
                    : "border border-line bg-panel-2 text-ink/90"
                }`}
              >
                {m.content}
              </div>
            ))}

            {busy ? (
              <div className="flex items-center gap-2 text-[13px] text-muted">
                <Spinner /> thinking…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-[14px] outline-none focus:border-accent"
              placeholder="Type your question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-xl bg-accent px-4 text-sm font-bold text-brand-cream disabled:opacity-40"
            >
              Ask
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
