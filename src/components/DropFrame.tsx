"use client";

import { ReactNode, useEffect, useState } from "react";

const WORLD = "https://hey-siri-write-that-down.vercel.app";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const SEEN_KEY = "nbs-drop01-joined";
export const JOINED_EVENT = "nbs-drop01-joined";
export const OPEN_EVENT = "nbs-drop01-open-signup";

function post(path: string, body: unknown) {
  return fetch(`${WORLD}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json() as Promise<{ ok?: boolean; state?: { code?: string } }>);
}

export function DropFrame({
  finished,
  hideTitle = false,
  label = "Drop 01 · free",
  freebie = "Drop 01 — Siri capture",
  title,
  sub = "Ten minutes. Say it out loud, it lands in Notion.",
}: {
  finished: boolean;
  hideTitle?: boolean;
  label?: string;
  freebie?: string;
  title?: ReactNode;
  sub?: string;
}) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [joined, setJoined] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) setJoined(true);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (finished && !joined) setOpen(true);
  }, [finished, joined]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (joined || everOpened) return;
    const t = setTimeout(() => {
      setOpen(true);
      setEverOpened(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [joined, everOpened]);

  async function submit() {
    const clean = email.trim().toLowerCase();
    if (!EMAIL.test(clean)) {
      setErr("That email doesn't look right.");
      return;
    }
    setErr("");
    setBusy(true);
    const answers = [
      q1.trim() ? `Biggest problem with AI: ${q1.trim()}` : "",
      q2.trim() ? `Why they want to build with AI: ${q2.trim()}` : "",
      q3.trim() ? `Wants me to build: ${q3.trim()}` : "",
    ].filter(Boolean);
    await post("/api/ask", {
      kind: "waitlist",
      email: clean,
      name: name.trim(),
      freebie,
      question: answers.join("\n"),
    }).catch(() => undefined);
    setJoined(true);
    setBusy(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new Event(JOINED_EVENT));
  }

  return (
    <>
      <div
        className={`mb-6 rounded-2xl border border-line bg-panel-2 px-4 sm:px-5 ${hideTitle ? "py-3" : "py-4"}`}
      >
        <div className="flex items-center justify-between gap-3">
          <a
            href={`${WORLD}/join`}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-brand-cocoa bg-brand-periwinkle px-3.5 py-2 text-[13px] font-bold text-brand-cocoa shadow-[3px_4px_0_var(--brand-cocoa)] hover:brightness-105"
          >
            ← back
          </a>
          <span className="squircle bg-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-brand-cream">
            {label}
          </span>
        </div>
        {hideTitle ? null : (
          <>
            <h2 className="mt-4 text-center text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">
              {title ?? (
                <>
                  &ldquo;Hey Siri &mdash; <span className="text-accent">write that down.</span>&rdquo;
                </>
              )}
            </h2>
            <p className="mt-2 text-center text-[14px] font-semibold leading-relaxed text-muted">
              {sub}
            </p>
          </>
        )}
      </div>

      {!open && !joined ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-4 z-40 flex items-center gap-2 rounded-full border-2 border-brand-cocoa bg-brand-periwinkle px-4 py-3 text-[13px] font-bold text-brand-cocoa shadow-[4px_5px_0_var(--brand-cocoa)]"
        >
          <span aria-hidden>✉</span> get the drops
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-8">
          <div className="w-full max-w-md rounded-[26px] bg-brand-periwinkle p-5 shadow-[0_18px_44px_rgba(27,27,42,0.34)]">
            {!joined ? (
              <>
                <span className="block text-center text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-rust">
                  the offer
                </span>
                <h3 className="mt-2 text-center text-[24px] font-black leading-[1.05] tracking-[-0.03em] text-[#1B1B2A]">
                  {finished ? "That one’s done. Want the next?" : "One email. Interactive guides that get AI working for you."}
                </h3>
                <p className="mx-auto mt-2 max-w-[330px] text-center text-[13.5px] leading-relaxed text-[#33305A]">
                  Not tips. Not news. Hands-on builds like this one &mdash; and your bot levels up with every
                  guide you finish.
                </p>

                <div className="mt-4 rounded-[22px] bg-brand-cream p-4">
                  <input
                    type="text"
                    autoComplete="given-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="your name"
                    className="w-full rounded-xl border border-[rgba(70,46,41,0.18)] bg-white/70 px-4 py-3 text-[15px] text-brand-cocoa outline-none placeholder:text-[#9E8776] focus:border-brand-rust"
                  />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="mt-2 w-full rounded-xl border border-[rgba(70,46,41,0.18)] bg-white/70 px-4 py-3 text-[15px] text-brand-cocoa outline-none placeholder:text-[#9E8776] focus:border-brand-rust"
                  />
                  <p className="mb-2 mt-3 text-[11.5px] font-extrabold uppercase tracking-[0.05em] text-[#8A7263]">
                    tell me about you &mdash; I actually read this
                  </p>
                  <input
                    type="text"
                    value={q1}
                    onChange={(e) => setQ1(e.target.value)}
                    placeholder="what’s your biggest problem with AI?"
                    className="w-full rounded-xl border border-[rgba(70,46,41,0.18)] bg-white/70 px-4 py-3 text-[15px] text-brand-cocoa outline-none placeholder:text-[#9E8776] focus:border-brand-rust"
                  />
                  <input
                    type="text"
                    value={q2}
                    onChange={(e) => setQ2(e.target.value)}
                    placeholder="why do you want to build with AI?"
                    className="mt-2 w-full rounded-xl border border-[rgba(70,46,41,0.18)] bg-white/70 px-4 py-3 text-[15px] text-brand-cocoa outline-none placeholder:text-[#9E8776] focus:border-brand-rust"
                  />
                  <input
                    type="text"
                    value={q3}
                    onChange={(e) => setQ3(e.target.value)}
                    placeholder="what would you like to build?"
                    className="mt-2 w-full rounded-xl border border-[rgba(70,46,41,0.18)] bg-white/70 px-4 py-3 text-[15px] text-brand-cocoa outline-none placeholder:text-[#9E8776] focus:border-brand-rust"
                  />
                  {err ? <p className="mt-2 text-[13px] font-semibold text-brand-rust">{err}</p> : null}
                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    className="mt-3 w-full rounded-full bg-brand-yellow px-5 py-3.5 text-[16px] font-extrabold text-[#3A2A15] shadow-[0_8px_22px_rgba(251,196,46,0.38)] active:translate-y-px disabled:opacity-40"
                  >
                    {busy ? "Signing you up…" : "sign up!"}
                  </button>
                  <p className="mt-2 text-center text-[11.5px] text-[#9E8776]">Free. One tap to unsubscribe.</p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-3 w-full text-[13px] font-semibold text-[#33305A] hover:text-[#1B1B2A]"
                >
                  not now
                </button>
              </>
            ) : (
              <>
                <h3 className="text-center text-[24px] font-black leading-tight tracking-[-0.03em] text-[#1B1B2A]">
                  You&apos;re in.
                </h3>
                <div className="mt-4 rounded-[22px] bg-brand-cream p-4">
                  <p className="text-[13.5px] leading-relaxed text-[#6A5348]">
                    The next drop lands in your inbox — one guide, one small build. I read every
                    answer you just sent me.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-3 w-full text-[13px] font-semibold text-[#33305A] hover:text-[#1B1B2A]"
                >
                  keep building
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
