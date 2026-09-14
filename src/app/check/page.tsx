"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Callout, Copyable, Spinner } from "@/components/ui";
import { HelperChat } from "@/components/HelperChat";

type Line = { tone: "good" | "bad" | "warn"; text: string };

function maskKey(url: string): string {
  return url.replace(/key=([^&]{0,8})[^&]*/i, (_m, head: string) => `key=${head}…(${url.length} chars total)`);
}

function inspect(raw: string): Line[] {
  const lines: Line[] = [];
  const url = raw.trim();
  if (raw !== url) lines.push({ tone: "warn", text: "There was a space or line break around the link — I trimmed it. Fix that in the Shortcut too." });
  if (!/^https:\/\//i.test(url)) {
    lines.push({ tone: "bad", text: "The link doesn't start with https:// — iPhone refuses those, which shows up as a connection error." });
    return lines;
  }
  lines.push({ tone: "good", text: "Starts with https://" });
  if (!/\/api\/capture/i.test(url)) lines.push({ tone: "bad", text: "The link doesn't contain /api/capture — that's the part that actually saves the idea." });
  else lines.push({ tone: "good", text: "Points at /api/capture" });
  if (/devinapps\.com/i.test(url)) lines.push({ tone: "bad", text: "This is an old preview link. That server no longer exists — get a fresh link from the setup wizard." });
  if (/\s/.test(url)) lines.push({ tone: "bad", text: "There's a space in the middle of the link. Delete it and paste again." });
  if (!/[?&]key=/i.test(url)) lines.push({ tone: "warn", text: "No key= in the link. That's only correct if you deployed the webhook to your own Vercel with the Notion values set there." });
  else lines.push({ tone: "good", text: "Carries a key" });
  return lines;
}

export default function CheckPage() {
  const [url, setUrl] = useState("");
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [verdict, setVerdict] = useState<{ tone: "good" | "bad" | "warn"; title: string; body: string } | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [copied, setCopied] = useState(false);

  async function run() {
    const clean = url.trim();
    setBusy(true);
    setPageUrl("");
    setVerdict(null);
    const found = inspect(url);
    setLines(found);

    if (found.some((l) => l.tone === "bad")) {
      setVerdict({ tone: "bad", title: "The link itself is wrong", body: "Fix the points above first — nothing will get through until the address is right." });
      setBusy(false);
      return;
    }

    let server: { ok?: boolean; reachable?: boolean; error?: string; status?: number; pageUrl?: string } = {};
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: clean, idea: idea.trim() }),
      });
      server = (await res.json()) as typeof server;
    } catch {
      server = {};
    }

    const next: Line[] = [...found];
    if (server.ok) {
      next.push({ tone: "good", text: "Sent a real idea through that link and Notion saved it." });
      if (server.pageUrl) setPageUrl(server.pageUrl);
    } else if (server.reachable) {
      next.push({ tone: "bad", text: `The webhook answered but refused it: ${server.error ?? "unknown error"}` });
    } else {
      next.push({ tone: "bad", text: server.error ?? "Nothing answered at that address, so it's wrong or that deployment is gone." });
    }

    // A browser can be blocked by CORS where the Shortcut is not, so this only ever
    // adds a note about the phone's own connection — never the verdict.
    if (server.ok) {
      try {
        await fetch(clean, { method: "GET" });
      } catch {
        next.push({
          tone: "warn",
          text: "This phone's browser couldn't open that address itself. Usually harmless, but if the Shortcut also fails, turn off VPN / Private Relay / content blockers or switch between wifi and cellular.",
        });
      }
    }
    setLines(next);

    setVerdict(
      server.ok
        ? {
            tone: "good",
            title: "The link works",
            body: "An idea went all the way into Notion through it. So whatever is in your Shortcut isn't this link — open Get Contents of URL, delete what's there, and paste this one in.",
          }
        : { tone: "bad", title: "Couldn't save the idea", body: server.error || "Unknown failure." },
    );
    setBusy(false);
  }

  const splitLink = (() => {
    const [base, query] = url.trim().split("?");
    const key = new URLSearchParams(query || "").get("key");
    return key ? { base, key } : null;
  })();

  const report = [
    "Idea Capture check",
    `link: ${maskKey(url.trim())}`,
    ...lines.map((l) => `${l.tone === "good" ? "OK  " : l.tone === "warn" ? "HMM " : "BAD "} ${l.text}`),
    verdict ? `verdict: ${verdict.title} — ${verdict.body}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[720px] px-5 pb-24 pt-8">
      <header className="mb-6">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="squircle flex h-7 w-7 items-center justify-center bg-accent text-[13px] font-bold text-brand-cream">
            S
          </span>
          <span className="text-[13px] font-bold tracking-tight">
            Idea Capture <span className="font-hand text-[16px] font-normal text-accent">by @NextbySophie</span>
          </span>
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Why isn&apos;t it saving?</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink/80">
          Do this on the iPhone that&apos;s failing. Paste the link your Shortcut is calling and I&apos;ll tell you what&apos;s
          wrong in plain English.
        </p>
      </header>

      <div className="card space-y-4">
        <label className="block">
          <div className="mb-2 text-sm font-semibold">Your capture link</div>
          <div className="mb-2 text-[13px] text-muted">
            In Shortcuts, open the shortcut → tap the <strong>Get Contents of URL</strong> box → hold the address → Select
            All → Copy. Then paste it here.
          </div>
          <textarea
            className="h-28 w-full rounded-xl border border-line bg-panel-2 px-4 py-3 font-mono text-[13px] outline-none focus:border-accent"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/api/capture?key=…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="block">
          <div className="mb-2 text-sm font-semibold">Test idea (optional)</div>
          <input
            className="w-full rounded-xl border border-line bg-panel-2 px-4 py-3 text-[14px] outline-none focus:border-accent"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Test from the checker"
          />
        </label>
        <Button onClick={run} disabled={busy || !url.trim()} full>
          {busy ? (
            <>
              <Spinner /> Testing…
            </>
          ) : (
            "Test this link"
          )}
        </Button>
      </div>

      {lines.length > 0 ? (
        <div className="card mt-5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted">What I found</div>
          <ul className="space-y-2">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-relaxed">
                <span aria-hidden className={l.tone === "good" ? "text-ok" : l.tone === "warn" ? "text-warn" : "text-bad"}>
                  {l.tone === "good" ? "\u2713" : l.tone === "warn" ? "\u26A0" : "\u2715"}
                </span>
                <span className="min-w-0 text-ink/85">{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {verdict ? (
        <div className="mt-5 space-y-4">
          <Callout tone={verdict.tone} title={verdict.title}>
            {verdict.body}
            {pageUrl ? (
              <>
                {" "}
                <a className="text-accent-2 underline" href={pageUrl} target="_blank" rel="noreferrer">
                  Open the row in Notion
                </a>
              </>
            ) : null}
          </Callout>
          {verdict.tone === "good" && splitLink ? (
            <Callout tone="warn" title={'Still "the network connection was lost" on the phone?'}>
              <p className="mb-3">
                Then it&apos;s the length of the address, not the link. Shorten it: put only the first box below in{" "}
                <strong>Get Contents of URL</strong>, then add a third Text field named{" "}
                <span className="font-mono">key</span> to the JSON body and paste the second box into its value.
              </p>
              <Copyable label="URL box" value={splitLink.base} />
              <div className="mt-3">
                <Copyable label="key field value" value={splitLink.key} />
              </div>
            </Callout>
          ) : null}
          <button
            type="button"
            className="w-full rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm font-semibold hover:border-accent/60"
            onClick={() => {
              navigator.clipboard.writeText(report).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                },
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied — paste it wherever you're asking for help" : "Copy this report (your key stays hidden)"}
          </button>
        </div>
      ) : null}

      <div className="mt-6 text-center text-[13px] text-muted">
        <Link className="text-accent-2 underline" href="/">
          Back to the setup wizard
        </Link>
      </div>

      <HelperChat stepTitle="Troubleshooting a failing capture link" />
    </main>
  );
}
