"use client";

import { ReactNode, useState } from "react";

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  href,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "quiet";
  disabled?: boolean;
  href?: string;
  full?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed";
  const styles = {
    primary:
      "bg-accent text-brand-cream hover:brightness-110 shadow-[0_6px_20px_-8px_rgba(137,46,26,0.8)]",
    ghost: "border border-line bg-panel-2 text-ink hover:border-accent/60",
    quiet: "text-muted hover:text-ink",
  }[variant];
  const cls = `${base} ${styles} ${full ? "w-full" : ""}`;

  if (href) {
    return (
      <a className={cls} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <button className={cls} onClick={onClick} disabled={disabled} type="button">
      {children}
    </button>
  );
}

export function Copyable({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label ? <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">{label}</div> : null}
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-xl border border-line bg-panel px-4 py-3 font-mono text-[13px] text-accent-2">
          {value}
        </code>
        <button
          type="button"
          className="shrink-0 rounded-xl border border-line bg-panel-2 px-4 text-sm font-semibold hover:border-accent/60"
          onClick={() => {
            navigator.clipboard.writeText(value).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              },
              () => setCopied(false),
            );
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "good" | "warn" | "bad";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-brand-periwinkle/50 bg-brand-periwinkle/15 text-ink",
    good: "border-ok/35 bg-ok/10 text-ink",
    warn: "border-warn/35 bg-warn/10 text-ink",
    bad: "border-bad/40 bg-bad/10 text-ink",
  }[tone];
  const icon = { info: "\u{1F4A1}", good: "\u2713", warn: "\u26A0", bad: "\u2715" }[tone];
  return (
    <div className={`rounded-2xl border px-4 py-3 text-[14px] leading-relaxed ${tones}`}>
      <div className="flex gap-3">
        <span aria-hidden className="pt-[1px] text-base">
          {icon}
        </span>
        <div className="min-w-0">
          {title ? <div className="mb-1 font-semibold">{title}</div> : null}
          <div className="text-[14px] text-ink/85">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function NumberedStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="squircle mt-[2px] flex h-7 w-7 shrink-0 items-center justify-center bg-brand-yellow text-[13px] font-bold text-ink">
        {n}
      </span>
      <div className="min-w-0 pt-[3px] text-[15px] leading-relaxed text-ink/85">{children}</div>
    </li>
  );
}

export function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold">{label}</div>
      {hint ? <div className="mb-2 text-[13px] text-muted">{hint}</div> : null}
      <input
        type={type}
        className="w-full rounded-xl border border-line bg-panel-2 px-4 py-3 font-mono text-[14px] outline-none focus:border-accent"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
