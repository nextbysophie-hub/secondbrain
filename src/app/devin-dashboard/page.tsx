"use client";

import { useState } from "react";
import { post } from "@/components/DropFrame";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FIELD =
  "w-full rounded-xl border border-[rgba(70,46,41,0.18)] bg-white/70 px-4 py-3 text-[15px] text-brand-cocoa outline-none placeholder:text-[#9E8776] focus:border-brand-rust";

export default function DevinDashboardWaitlist() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [want, setWant] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [joined, setJoined] = useState(false);

  async function submit() {
    const clean = email.trim().toLowerCase();
    if (!EMAIL.test(clean)) {
      setErr("That email doesn't look right.");
      return;
    }
    setErr("");
    setBusy(true);
    await post("/api/ask", {
      kind: "waitlist",
      email: clean,
      name: name.trim(),
      freebie: "Waitlist — Build your dashboard in Devin",
      question: want.trim() ? `Wants on their dashboard: ${want.trim()}` : "",
    }).catch(() => undefined);
    setBusy(false);
    setJoined(true);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-20 pt-10 sm:px-8">
      <div className="mb-8 flex items-center justify-between">
        <a
          href="https://nextbysophie.com"
          className="rounded-full border-2 border-brand-cocoa bg-brand-periwinkle px-3.5 py-2 text-[13px] font-bold text-brand-cocoa hover:brightness-105"
        >
          ← back
        </a>
        <span className="squircle bg-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-brand-cream">
          Waitlist
        </span>
      </div>

      <div className="font-hand text-[24px] leading-none text-accent">coming soon</div>
      <h1 className="mt-2 text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[42px]">
        Build your own dashboard in Devin
      </h1>
      <p className="mt-4 text-[17px] leading-relaxed text-ink/80">
        A step-by-step build, done on your laptop. You tell Devin, an AI engineer, what you want in plain English,
        and it builds a dashboard on top of your Notion and puts it online. You don&apos;t touch any code.
      </p>

      <ul className="mt-6 space-y-3 text-[15px] text-ink/85">
        <li className="flex gap-3">
          <span aria-hidden>✅</span> <span>Your to-dos for today. Tick one off and it&apos;s done in Notion too</span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden>💡</span> <span>Your idea inbox, with everything you told Siri</span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden>📱</span> <span>On your phone&apos;s home screen, in your own colors</span>
        </li>
      </ul>

      <div className="mt-8 rounded-[22px] bg-brand-periwinkle p-5">
        {joined ? (
          <>
            <h2 className="text-center text-[24px] font-black leading-tight tracking-[-0.03em] text-[#1B1B2A]">
              You&apos;re on the list.
            </h2>
            <p className="mt-2 text-center text-[14px] leading-relaxed text-[#33305A]">
              You&apos;ll be the first to know when the build is ready.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-center text-[22px] font-black leading-tight tracking-[-0.03em] text-[#1B1B2A]">
              Get it first
            </h2>
            <div className="mt-4 space-y-2 rounded-[18px] bg-brand-cream p-4">
              <input
                type="text"
                autoComplete="given-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="your name"
                className={FIELD}
              />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className={FIELD}
              />
              <input
                type="text"
                value={want}
                onChange={(e) => setWant(e.target.value)}
                placeholder="what would you want on your dashboard? (optional)"
                className={FIELD}
              />
              {err ? <p className="text-[13px] font-semibold text-brand-rust">{err}</p> : null}
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="mt-1 w-full rounded-full bg-brand-yellow px-5 py-3.5 text-[16px] font-extrabold text-[#3A2A15] active:translate-y-px disabled:opacity-40"
              >
                {busy ? "Adding you…" : "join the waitlist"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
