"use client";

import { useEffect, useMemo, useState } from "react";
import { Explain } from "@/components/Explain";
import { HelperChat } from "@/components/HelperChat";
import {
  Databases,
  Done,
  HostedLink,
  HostingChoice,
  NotionKey,
  Requirements,
  SelfDeploy,
  ShortcutIdea,
  ShortcutTask,
  StepProps,
  TestIt,
  Welcome,
} from "@/components/steps";
import { DropFrame, JOINED_EVENT, OPEN_EVENT, SEEN_KEY } from "@/components/DropFrame";
import { DropIntro } from "@/components/DropIntro";
import { EMPTY_STATE, STORAGE_KEY, WizardState } from "@/lib/wizard";

type Step = {
  id: string;
  title: string;
  kicker: string;
  Body: (p: StepProps) => React.JSX.Element;
};

const BASE_STEPS: Step[] = [
  { id: "welcome", kicker: "Welcome", title: "Never lose an idea again", Body: Welcome },
  { id: "requirements", kicker: "Before we start", title: "How this works, and what you'll need", Body: Requirements },
  { id: "notion-key", kicker: "Step 1", title: "Give Notion's door a key", Body: NotionKey },
  { id: "databases", kicker: "Step 2", title: "Build your idea databases", Body: Databases },
  { id: "hosting", kicker: "Step 3", title: "Where should it run?", Body: HostingChoice },
];

/** On /drop01 the first three screens are open; the rest unlocks with an email. */
const GATE_AT = 3;

/** One [top-left, top-right] tint pair per slide, all mixed from the brand swatches. */
const SLIDE_TINTS: [string, string][] = [
  ["rgba(134, 158, 237, 0.30)", "rgba(255, 199, 60, 0.34)"], // periwinkle + yellow
  ["rgba(255, 199, 60, 0.36)", "rgba(176, 144, 111, 0.30)"], // yellow + tan
  ["rgba(176, 144, 111, 0.34)", "rgba(134, 158, 237, 0.30)"], // tan + periwinkle
  ["rgba(137, 46, 26, 0.16)", "rgba(255, 199, 60, 0.34)"], // rust + yellow
  ["rgba(134, 158, 237, 0.34)", "rgba(176, 144, 111, 0.28)"], // periwinkle + tan
  ["rgba(255, 199, 60, 0.30)", "rgba(137, 46, 26, 0.16)"], // yellow + rust
  ["rgba(176, 144, 111, 0.30)", "rgba(255, 199, 60, 0.34)"], // tan + yellow
  ["rgba(134, 158, 237, 0.28)", "rgba(137, 46, 26, 0.14)"], // periwinkle + rust
  ["rgba(255, 199, 60, 0.40)", "rgba(134, 158, 237, 0.30)"], // yellow + periwinkle
  ["rgba(255, 199, 60, 0.44)", "rgba(255, 199, 60, 0.30)"], // finish line: all yellow
];

const TAIL_STEPS: Step[] = [
  { id: "shortcut-idea", kicker: "Step 5", title: "Build the “Capture Idea” shortcut", Body: ShortcutIdea },
  { id: "shortcut-task", kicker: "Step 6", title: "Build the “Capture To-do” shortcut", Body: ShortcutTask },
  { id: "test", kicker: "Step 7", title: "Test it", Body: TestIt },
  { id: "done", kicker: "You're done", title: "Your second brain is live", Body: Done },
];

export function Wizard({ drop = false }: { drop?: boolean }) {
  const [s, setState] = useState<WizardState>(EMPTY_STATE);
  const [index, setIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [origin, setOrigin] = useState("");
  const [resume, setResume] = useState(0);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { state?: WizardState; index?: number };
        if (saved.state) setState({ ...EMPTY_STATE, ...saved.state });
        if (typeof saved.index === "number") {
          setResume(saved.index);
          setIndex(drop ? 0 : saved.index);
        }
      }
    } catch {
      /* a corrupt draft shouldn't trap someone on a blank screen */
    }
    setHydrated(true);
  }, [drop]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: s, index }));
  }, [s, index, hydrated]);

  const steps = useMemo(() => {
    const hostingStep: Step =
      s.hosting === "self"
        ? { id: "self-deploy", kicker: "Step 4", title: "Put it on your own Vercel", Body: SelfDeploy }
        : { id: "hosted-link", kicker: "Step 4", title: "Get your capture link", Body: HostedLink };
    const base = drop
      ? [{ ...BASE_STEPS[0], Body: DropIntro }, ...BASE_STEPS.slice(1)]
      : BASE_STEPS;
    return [...base, hostingStep, ...TAIL_STEPS];
  }, [s.hosting, drop]);

  const clamped = Math.min(index, steps.length - 1);
  const step = steps[clamped];

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) setJoined(true);
    } catch {
      /* private mode */
    }
    const onJoined = () => setJoined(true);
    window.addEventListener(JOINED_EVENT, onJoined);
    return () => window.removeEventListener(JOINED_EVENT, onJoined);
  }, []);

  useEffect(() => {
    const [a, b] = SLIDE_TINTS[clamped % SLIDE_TINTS.length];
    document.body.style.setProperty("--tint-a", a);
    document.body.style.setProperty("--tint-b", b);
  }, [clamped]);
  const set = (patch: Partial<WizardState>) => setState((prev) => ({ ...prev, ...patch }));
  const next = () =>
    setIndex((i) => Math.min(drop && i === 0 ? Math.max(1, resume) : i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));

  if (!hydrated) return null;

  const progress = (clamped / (steps.length - 1)) * 100;

  const finished = step.id === "done";
  const intro = drop && clamped === 0;
  const locked = drop && !joined && clamped >= GATE_AT;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-28 pt-8 sm:px-8">
      {drop ? <DropFrame finished={finished} hideTitle={intro} /> : null}

      <header className="mb-8">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="squircle flex h-7 w-7 items-center justify-center bg-accent text-[13px] font-bold text-brand-cream">
              S
            </span>
            <span className="text-[13px] font-bold tracking-tight">
              Idea Capture <span className="font-hand text-[16px] font-normal text-accent">by @NextbySophie</span>
            </span>
          </div>
          <button
            type="button"
            className="text-[12px] text-muted hover:text-ink"
            onClick={() => {
              if (confirm("Start the whole setup over? Your Notion databases stay where they are.")) {
                localStorage.removeItem(STORAGE_KEY);
                setState(EMPTY_STATE);
                setResume(0);
                setIndex(0);
              }
            }}
          >
            Start over
          </button>
        </div>

        {intro ? null : (
          <>
            <div className="h-1.5 overflow-hidden rounded-full border border-line bg-panel-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-brand-yellow transition-[width] duration-500"
                style={{ width: `${Math.max(progress, 3)}%` }}
              />
            </div>
            <div className="mt-2 text-[12px] text-muted">
              {clamped + 1} of {steps.length}
            </div>
          </>
        )}
      </header>

      <section key={step.id} className="slide-in flex-1">
        {intro ? null : (
          <>
            <div className="mb-1 font-hand text-[22px] leading-none text-accent">{step.kicker}</div>
            <h1 className="mb-5 text-[30px] font-bold leading-tight tracking-tight sm:text-[36px]">{step.title}</h1>
            <Explain stepId={step.id} />
          </>
        )}
        {locked ? (
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none max-h-[70vh] select-none overflow-hidden blur-[7px] saturate-[0.85]"
            >
              <step.Body s={s} set={set} next={next} origin={origin} />
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
                  You&apos;re halfway. Sign up and the rest of the steps unlock &mdash; plus your bot, your key,
                  and every drop after this one.
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
          <step.Body s={s} set={set} next={next} origin={origin} />
        )}
      </section>

      {clamped > 0 ? (
        <button type="button" onClick={back} className="mt-10 self-start text-[13px] text-muted hover:text-ink">
          ← Back
        </button>
      ) : null}

      <HelperChat stepTitle={step.title} />
    </main>
  );
}
