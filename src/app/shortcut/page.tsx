"use client";

import { useState } from "react";

/** Standalone builder: paste a capture link or key on the phone and get the
 *  finished Shortcut file, without walking the whole wizard again. */
export default function ShortcutPage() {
  const [input, setInput] = useState("");

  const key = (() => {
    const v = input.trim();
    if (!v) return "";
    const q = v.indexOf("key=");
    return q >= 0 ? v.slice(q + 4).trim() : v;
  })();

  const href = (kind: "content" | "task") =>
    `/api/shortcut?type=${kind}&key=${encodeURIComponent(key)}`;

  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <h1 className="text-2xl font-semibold">Build a shortcut file</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        For maintainers. iOS refuses shortcut files Apple hasn&apos;t signed, so a download from here only installs
        after <span className="font-mono">shortcuts sign -m anyone -i in.shortcut -o out.shortcut</span> on a Mac.
        Everyone else should use the ready-made link in the wizard. Leave the box empty for a blank template.
      </p>

      <textarea
        className="mt-6 h-32 w-full rounded-xl border border-line bg-panel-2 p-3 font-mono text-[13px]"
        placeholder="https://capture-idea-setup.vercel.app/api/capture?key=..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <div className="mt-5 flex flex-wrap gap-3">
        <a
          className="rounded-xl bg-accent px-4 py-2 text-[15px] font-semibold text-brand-cream"
          href={href("content")}
          download="Capture Idea.shortcut"
        >
          Capture Idea
        </a>
        <a
          className="rounded-xl bg-accent px-4 py-2 text-[15px] font-semibold text-brand-cream"
          href={href("task")}
          download="Capture To-do.shortcut"
        >
          Capture To-do
        </a>
      </div>
    </main>
  );
}
