"use client";

import { ReactNode, useEffect, useState } from "react";

/** The pieces every drop is built from: a thing to copy, a place to go, and a
 *  list you can tick off — so a guide is read by doing it, not by reading. */

export function Copy({ label, text }: { label?: string; text: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <div className="rounded-2xl border-2 border-brand-cocoa bg-panel-2 p-3 shadow-[3px_4px_0_var(--brand-cocoa)]">
      {label ? (
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
          {label}
        </div>
      ) : null}
      <p className="whitespace-pre-wrap break-words font-mono text-[13.5px] leading-relaxed text-ink">
        {text}
      </p>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(text).catch(() => undefined);
          setDone(true);
        }}
        className="mt-3 w-full rounded-full bg-brand-yellow px-4 py-2.5 text-[14px] font-bold text-brand-cocoa active:translate-y-px"
      >
        {done ? "copied ✓" : "copy this"}
      </button>
    </div>
  );
}

export function Go({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-brand-cocoa bg-brand-periwinkle px-4 py-2.5 text-[14px] font-bold text-brand-cocoa shadow-[3px_4px_0_var(--brand-cocoa)] hover:brightness-105"
    >
      {children}
    </a>
  );
}

/** A quieter link for the "where this is written down" references. */
export function Ref({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-accent underline underline-offset-2"
    >
      {children}
    </a>
  );
}

/** Ticks survive a refresh, because nobody finishes a build in one sitting. */
export function Checklist({ id, items }: { id: string; items: string[] }) {
  const key = `nbs-check-${id}`;
  const [done, setDone] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setDone(JSON.parse(raw) as string[]);
    } catch {
      /* private mode */
    }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify(done));
    } catch {
      /* private mode */
    }
  }, [done, key, ready]);

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const on = done.includes(item);
        return (
          <li key={item}>
            <button
              type="button"
              onClick={() =>
                setDone((d) => (on ? d.filter((x) => x !== item) : [...d, item]))
              }
              className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${
                on
                  ? "border-accent bg-accent/10"
                  : "border-line bg-panel hover:border-ink/30"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md border-2 text-[12px] font-bold ${
                  on
                    ? "border-accent bg-accent text-brand-cream"
                    : "border-line text-transparent"
                }`}
              >
                ✓
              </span>
              <span
                className={`text-[14.5px] leading-snug ${on ? "text-muted line-through" : ""}`}
              >
                {item}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3 text-[13.5px] leading-relaxed text-muted">
      {children}
    </div>
  );
}

/** Numbered clicks, for the bits that really are just "tap this, then that". */
export function Taps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-cocoa text-[12px] font-bold text-brand-cream">
            {i + 1}
          </span>
          <span className="text-[14.5px] leading-snug">{s}</span>
        </li>
      ))}
    </ol>
  );
}
