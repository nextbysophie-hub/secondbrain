"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Where QR 1 lands. Scanning used to open the raw /api/capture JSON, which read
 * as an error to anyone who isn't a developer — this is the same link, shown as
 * something with a Copy button on it.
 */
function LinkBody() {
  const params = useSearchParams();
  const raw = (params.get("u") || "").trim();
  const key = (params.get("key") || "").trim();
  const link = raw || (key ? `${typeof window === "undefined" ? "" : window.location.origin}/api/capture?key=${key}` : "");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  if (!link) {
    return (
      <p className="text-[15px] leading-relaxed text-muted">
        This page needs a capture link in its address. Go back to the setup wizard and scan the square there again.
      </p>
    );
  }

  return (
    <>
      <h1 className="font-hand text-[34px] leading-tight text-accent">Your capture link</h1>
      <p className="text-[15px] leading-relaxed text-muted">
        This is the whole thing your shortcut needs. Tap the button, then paste it into the{" "}
        <strong className="text-ink/80">Text</strong> box at the top of the shortcut.
      </p>

      <div className="break-all rounded-2xl border border-line bg-panel-2 p-4 font-mono text-[12px] leading-relaxed text-ink/70">
        {link}
      </div>

      <button
        type="button"
        onClick={copy}
        className="w-full rounded-xl bg-accent px-4 py-4 text-[17px] font-semibold text-brand-cream"
      >
        {copied ? "Copied ✓" : "Copy my capture link"}
      </button>

      <p className="text-[13px] leading-relaxed text-muted">
        If nothing seems to copy, press and hold the grey text above, choose <strong>Select All</strong>, then{" "}
        <strong>Copy</strong>. Keep this tab open until you&apos;ve pasted it.
      </p>
    </>
  );
}

export default function LinkPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-5 py-10">
      <Suspense fallback={null}>
        <LinkBody />
      </Suspense>
    </main>
  );
}
