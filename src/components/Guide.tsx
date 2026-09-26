"use client";

import { ReactNode, useEffect, useState } from "react";
import { HelperChat } from "@/components/HelperChat";
import { DropFrame, JOINED_EVENT, OPEN_EVENT, SEEN_KEY } from "@/components/DropFrame";

export type GuideStep = { id: string; kicker: string; title: string; Body: () => ReactNode };

export type GuideSpec = {
  /** Keeps each guide's saved place separate from the others. */
  slug: string;
  label: string;
  freebie: string;
  headline: ReactNode;
  /** Short title for the sticky header once she's past the intro. */
  frameTitle: ReactNode;
  promise: ReactNode;
  goal: ReactNode;
  stats: [string, string][];
  outline: [string, string][];
  steps: GuideStep[];
  /** Screens that stay open before the email wall. */
  gateAt: number;
};

const TINTS: [string, string][] = [
  ["rgba(134, 158, 237, 0.30)", "rgba(255, 199, 60, 0.34)"],
  ["rgba(255, 199, 60, 0.36)", "rgba(176, 144, 111, 0.30)"],
  ["rgba(176, 144, 111, 0.34)", "rgba(134, 158, 237, 0.30)"],
  ["rgba(137, 46, 26, 0.16)", "rgba(255, 199, 60, 0.34)"],
  ["rgba(134, 158, 237, 0.34)", "rgba(176, 144, 111, 0.28)"],
  ["rgba(255, 199, 60, 0.30)", "rgba(137, 46, 26, 0.16)"],
  ["rgba(176, 144, 111, 0.30)", "rgba(255, 199, 60, 0.34)"],
  ["rgba(255, 199, 60, 0.44)", "rgba(255, 199, 60, 0.30)"],
];

export function Guide({ spec }: { spec: GuideSpec }) {
  const key = `nbs-guide-${spec.slug}`;
  const [index, setIndex] = useState(0);
  const [resume, setResume] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setResume(Math.min(Number(raw) || 0, spec.steps.length));
      if (localStorage.getItem(SEEN_KEY)) setJoined(true);
    } catch {
      /* private mode */
    }
    setHydrated(true);
    const onJoined = () => setJoined(true);
    window.addEventListener(JOINED_EVENT, onJoined);
    return () => window.removeEventListener(JOINED_EVENT, onJoined);
  }, [key, spec.steps.length]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, String(index));
    } catch {
      /* private mode */
    }
  }, [index, key, hydrated]);

  useEffect(() => {
    const [a, b] = TINTS[index % TINTS.length];
    document.body.style.setProperty("--tint-a", a);
    document.body.style.setProperty("--tint-b", b);
  }, [index]);

  if (!hydrated) return null;

  const intro = index === 0;
  const step = intro ? spec.steps[0] : spec.steps[index - 1];
  const Body = step.Body;
  const finished = index === spec.steps.length;
  const locked = !joined && index > spec.gateAt;
  const progress = (index / spec.steps.length) * 100;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-28 pt-8 sm:px-8">
      <DropFrame
        finished={finished}
        hideTitle={intro}
        label={spec.label}
        freebie={spec.freebie}
        title={spec.frameTitle}
        sub={typeof spec.promise === "string" ? spec.promise : undefined}
      />

      {intro ? (
        <Intro spec={spec} resume={resume} start={() => setIndex(Math.max(1, resume))} />
      ) : (
        <>
          <header className="mb-8">
            <div className="h-1.5 overflow-hidden rounded-full border border-line bg-panel-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-brand-yellow transition-[width] duration-500"
                style={{ width: `${Math.max(progress, 4)}%` }}
              />
            </div>
            <div className="mt-2 text-[12px] text-muted">
              {index} of {spec.steps.length}
            </div>
          </header>

          <section key={step.id} className="slide-in flex-1">
            <div className="mb-1 font-hand text-[22px] leading-none text-accent">{step.kicker}</div>
            <h1 className="mb-5 text-[30px] font-bold leading-tight tracking-tight sm:text-[36px]">
              {step.title}
            </h1>

            {locked ? (
              <div className="relative">
                <div
                  aria-hidden
                  className="pointer-events-none max-h-[70vh] select-none overflow-hidden blur-[7px] saturate-[0.85]"
                >
                  <Body />
                </div>
                <div className="absolute inset-0 flex items-start justify-center bg-gradient-to-b from-transparent via-[rgba(242,231,218,0.72)] to-[var(--brand-cream)] pt-6">
                  <div className="sticky top-6 w-full max-w-sm rounded-[26px] bg-brand-periwinkle p-5 text-center shadow-[0_18px_44px_rgba(27,27,42,0.28)]">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-rust">
                      the rest of the build
                    </span>
                    <h2 className="mt-2 text-[23px] font-black leading-[1.05] tracking-[-0.03em] text-[#1B1B2A]">
                      Drop your email to finish the build.
                    </h2>
                    <p className="mx-auto mt-2 max-w-[300px] text-[13.5px] leading-relaxed text-[#33305A]">
                      You&apos;re halfway. Sign up and the rest of the steps unlock, plus every drop after
                      this one.
                    </p>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
                      className="mt-4 w-full rounded-full bg-brand-yellow px-5 py-3.5 text-[16px] font-extrabold text-[#3A2A15] shadow-[0_8px_22px_rgba(251,196,46,0.38)] active:translate-y-px"
                    >
                      unlock the rest
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <Body />
                {index < spec.steps.length ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIndex(index + 1);
                      window.scrollTo({ top: 0 });
                    }}
                    className="w-full rounded-full bg-brand-yellow px-6 py-4 text-[17px] font-bold text-brand-cocoa shadow-[0_8px_22px_rgba(255,199,60,0.45)] active:translate-y-px"
                  >
                    Next
                  </button>
                ) : null}
              </div>
            )}
          </section>

          <button
            type="button"
            onClick={() => {
              setIndex(index - 1);
              window.scrollTo({ top: 0 });
            }}
            className="mt-10 self-start text-[13px] text-muted hover:text-ink"
          >
            ← Back
          </button>
        </>
      )}

      <HelperChat stepTitle={intro ? spec.label : step.title} />
    </main>
  );
}

function Intro({
  spec,
  resume,
  start,
}: {
  spec: GuideSpec;
  resume: number;
  start: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <span className="inline-block rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-cream">
          {spec.label}
        </span>
        <h1 className="mt-4 text-[38px] font-black leading-[0.95] tracking-[-0.045em] sm:text-[52px]">
          {spec.headline}
        </h1>
        <p className="mx-auto mt-4 max-w-[340px] text-[15px] font-medium leading-relaxed text-muted">
          {spec.promise}
        </p>
      </div>

      <div className="relative rounded-3xl border-2 border-brand-cocoa bg-panel-2 px-5 pb-5 pt-5 shadow-[5px_6px_0_var(--brand-cocoa)]">
        <span className="absolute -top-3 left-5 rounded-full bg-brand-yellow px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-cocoa">
          the goal
        </span>
        <div className="mt-3 text-[17px] font-semibold leading-snug">{spec.goal}</div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {spec.stats.map(([big, small]) => (
          <div key={big} className="rounded-2xl border border-line bg-panel px-2 py-3">
            <div className="text-[17px] font-bold leading-none tracking-tight">{big}</div>
            <div className="mt-1.5 text-[11.5px] font-medium leading-tight text-muted">{small}</div>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-line bg-panel px-5 py-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
          what you&apos;ll build
        </div>
        <ol className="mt-3 space-y-3">
          {spec.outline.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-cocoa text-[12px] font-bold text-brand-cream">
                {i + 1}
              </span>
              <span className="text-[14.5px] leading-snug">
                <strong className="font-bold">{t}</strong>
                <span className="text-muted"> &mdash; {d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <button
          type="button"
          onClick={start}
          className="w-full rounded-full bg-brand-yellow px-6 py-4 text-[17px] font-bold text-brand-cocoa shadow-[0_8px_22px_rgba(255,199,60,0.45)] active:translate-y-px"
        >
          {resume > 1 ? "Pick up where you left off" : "Start building"}
        </button>
        <p className="mt-3 text-center text-[12.5px] leading-relaxed text-muted">
          Stuck on any step? Tap <strong className="font-bold text-ink">Stuck? Ask me</strong> at the bottom
          and it gets explained in plain English.
        </p>
      </div>

      <div className="flex justify-center pt-2">
        <div
          className="flex h-[150px] w-[150px] rotate-[-11deg] flex-col items-center justify-center rounded-full border-4 border-accent/90 text-center text-accent shadow-[inset_0_0_0_3px_rgba(137,46,26,0.25)]"
          role="img"
          aria-label="Guaranteed dummy proof: if you can tap, you can build it"
        >
          <span className="text-[10px] font-black uppercase tracking-[0.22em]">guaranteed</span>
          <span className="mt-1 text-[27px] font-black uppercase leading-[0.9] tracking-tight">
            dummy
            <br />
            proof
          </span>
          <span className="mt-1.5 max-w-[104px] border-t-2 border-accent/50 pt-1.5 text-[8.5px] font-bold uppercase leading-tight tracking-[0.06em]">
            if you can tap, you can build it
          </span>
        </div>
      </div>
    </div>
  );
}
