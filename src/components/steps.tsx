"use client";

import Image from "next/image";
import { useState } from "react";
import { Button, Callout, Copyable, Field, NumberedStep, Spinner } from "./ui";
import { LogicForDummies } from "./Explain";
import { PhoneHandoff } from "./PhoneHandoff";
import { SHORTCUT_LINKS, WizardState, captureUrl, vercelDeployUrl } from "@/lib/wizard";

export type StepProps = {
  s: WizardState;
  set: (patch: Partial<WizardState>) => void;
  next: () => void;
  origin: string;
};

/* ------------------------------------------------------------------ 1. Welcome */

export function Welcome({ next }: StepProps) {
  return (
    <div className="space-y-7">
      <p className="text-[17px] leading-relaxed text-ink/80">
        You&apos;re about to set up a <strong className="text-ink">voice-activated second brain</strong>. When an idea
        hits — or you remember something you have to do — you say four words and it&apos;s filed in your Notion before
        you finish the sentence. Two databases, two phrases: <strong className="text-ink">ideas</strong> in one,{" "}
        <strong className="text-ink">to-dos</strong> in the other.
      </p>

      <div className="relative mt-16 rounded-2xl border border-line bg-panel-2 p-5">
        <Image
          src="/robot.png"
          alt="A little cardboard-and-metal robot sitting on the box, holding your ideas"
          width={515}
          height={520}
          priority
          className="pop pointer-events-none absolute -top-[86px] right-3 h-[104px] w-auto drop-shadow-[0_10px_14px_rgba(70,46,41,0.25)] sm:-top-[104px] sm:right-5 sm:h-[126px]"
        />
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted">What it looks like</div>
        <div className="space-y-3 text-[15px]">
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-lg">🗣️</span>
            <p className="text-ink/85">
              <span className="text-accent-2">&ldquo;Hey Siri, capture idea&rdquo;</span> → you say the idea out loud →
              it lands in <strong className="text-ink">Content Ideas</strong>
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-lg">✅</span>
            <p className="text-ink/85">
              <span className="text-accent-2">&ldquo;Hey Siri, capture to-do&rdquo;</span> → &ldquo;email the
              accountant&rdquo; → it lands in <strong className="text-ink">To-dos</strong>, not mixed in with your ideas
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-lg">📲</span>
            <p className="text-ink/85">
              Scrolling a reel you want to steal? Share → <span className="text-accent-2">Capture Idea</span> → saved
              with the link
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-lg">📓</span>
            <p className="text-ink/85">Both land in Notion, tagged and sorted, waiting for you</p>
          </div>
        </div>
      </div>

      <Callout tone="info" title="You don't need to be technical">
        Every step here is copy, paste, tap. If a word confuses you, hit the{" "}
        <strong>Stuck? Ask me</strong> button at the bottom right and I&apos;ll explain it in plain English.
      </Callout>

      <Button onClick={next}>Let&apos;s set it up →</Button>
    </div>
  );
}

/* ------------------------------------------------------------- 2. What you need */

export function Requirements({ next }: StepProps) {
  const items = [
    { icon: "📱", title: "An iPhone", body: "The Shortcuts app is already on it. You don't need to download anything." },
    { icon: "📓", title: "A Notion account", body: "The free plan is plenty. If you don't have one, make it at notion.so — takes 30 seconds." },
    { icon: "⏱️", title: "About 10 minutes", body: "You can stop halfway and come back — this page remembers where you were." },
  ];
  return (
    <div className="space-y-7">
      <LogicForDummies />
      <p className="text-[17px] leading-relaxed text-ink/80">
        Three things you need before we start, and two of them you already have.
      </p>
      <div className="grid gap-3">
        {items.map((i) => (
          <div key={i.title} className="flex gap-4 rounded-2xl border border-line bg-panel-2 p-4">
            <span aria-hidden className="text-2xl">{i.icon}</span>
            <div>
              <div className="font-semibold">{i.title}</div>
              <div className="mt-1 text-[14px] leading-relaxed text-muted">{i.body}</div>
            </div>
          </div>
        ))}
      </div>
      <Callout tone="good" title="Nothing here costs money">
        Notion free, Shortcuts free, and the piece that runs on the internet is free too — you&apos;d have to capture
        thousands of ideas a day to ever hit a paid tier.
      </Callout>
      <Button onClick={next}>Got all three →</Button>
    </div>
  );
}

/* ---------------------------------------------------------------- 3. Notion key */

export function NotionKey({ s, set, next }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/notion/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: s.token }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        workspaceName?: string | null;
        pages?: { id: string; title: string; url: string }[];
      };
      if (!json.ok) {
        setError(json.error ?? "That key didn't work.");
        set({ tokenVerified: false });
        return;
      }
      set({
        tokenVerified: true,
        workspaceName: json.workspaceName ?? null,
        pages: json.pages ?? [],
      });
    } catch {
      setError("Couldn't reach Notion just now. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <p className="text-[17px] leading-relaxed text-ink/80">
        Notion needs to know it&apos;s allowed to accept your ideas. You&apos;re going to make it a{" "}
        <strong className="text-ink">spare key</strong> and paste that key here.
      </p>

      <ol className="space-y-4">
        <NumberedStep n={1}>
          Open{" "}
          <a className="text-accent underline underline-offset-4" href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer">
            notion.so/my-integrations
          </a>{" "}
          and log in if it asks.
        </NumberedStep>
        <NumberedStep n={2}>
          Click <strong>New integration</strong> (newer Notion accounts call it <strong>New connection</strong> — same
          button).
        </NumberedStep>
        <NumberedStep n={3}>
          Name it <strong>Idea Capture</strong>, and check the <strong>workspace</strong> shown underneath is{" "}
          <em>your own</em>. If you belong to someone else&apos;s workspace too, Notion often picks that one by
          default, and then your key can never see your own pages.
        </NumberedStep>
        <NumberedStep n={4}>
          If it asks <strong>Internal</strong> or <strong>Public / OAuth</strong>, choose{" "}
          <strong>Internal</strong> — that&apos;s the &ldquo;just for me&rdquo; kind. Then hit <strong>Save</strong> or{" "}
          <strong>Create connection</strong>, whichever it shows.
        </NumberedStep>
        <NumberedStep n={5}>
          On the next screen you&apos;ll see a row of blurred-out dots labelled{" "}
          <strong>Internal Integration Secret</strong> (or <strong>Access token</strong>). Don&apos;t try to read it —
          click the little <strong>copy icon</strong> (the two overlapping rectangles) at the end of that row. That
          copies the whole thing.
        </NumberedStep>
        <NumberedStep n={6}>
          If your browser pops up <em>&ldquo;Save this password?&rdquo;</em>, tap <strong>Not now</strong>. It&apos;s
          not a password and saving it just makes a mess.
        </NumberedStep>
      </ol>

      <div className="space-y-4 rounded-2xl border border-line bg-panel-2 p-5">
        <Field
          label="Paste your key here"
          hint="It starts with ntn_ or secret_. It's encrypted the moment it's stored."
          type="password"
          value={s.token}
          onChange={(v) => {
            set({ token: v, tokenVerified: false });
            setError("");
          }}
          placeholder="ntn_..."
        />
        {s.tokenVerified ? (
          <Callout tone="good" title="Connected">
            Your key works{s.workspaceName ? <> — this is the <strong>{s.workspaceName}</strong> workspace</> : null}.
          </Callout>
        ) : (
          <Button onClick={verify} disabled={busy || !s.token.trim()}>
            {busy ? (
              <>
                <Spinner /> Checking…
              </>
            ) : (
              "Check my key"
            )}
          </Button>
        )}
        {error ? <Callout tone="bad" title="That didn't work">{error}</Callout> : null}
      </div>

      {s.tokenVerified ? <Button onClick={next}>Next →</Button> : null}
    </div>
  );
}

/* ----------------------------------------------------------- 4. Create databases */

export function Databases({ s, set, next }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reloading, setReloading] = useState(false);

  async function reloadPages() {
    setReloading(true);
    try {
      const res = await fetch("/api/notion/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: s.token }),
      });
      const json = (await res.json()) as { ok: boolean; pages?: { id: string; title: string; url: string }[] };
      if (json.ok) set({ pages: json.pages ?? [] });
    } finally {
      setReloading(false);
    }
  }

  async function provision() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/notion/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: s.token, parentPageId: s.parentPageId }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        content?: { id: string; url: string };
        task?: { id: string; url: string };
      };
      if (!json.ok) {
        setError(json.error ?? "Couldn't build the databases.");
        return;
      }
      set({ contentDb: json.content ?? null, taskDb: json.task ?? null });
    } catch {
      setError("Couldn't reach Notion just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedPage = s.pages.find((p) => p.id === s.parentPageId);

  if (s.contentDb && s.taskDb) {
    return (
      <div className="space-y-7">
        <div className="pop text-center text-5xl" aria-hidden>
          ✨
        </div>
        <Callout tone="good" title="Your two databases are live">
          They already have the right columns, statuses and colours. You never have to configure them.
        </Callout>
        <div className="grid gap-3">
          <a className="flex items-center gap-3 rounded-2xl border border-line bg-panel-2 p-4 hover:border-accent/60" href={s.contentDb.url} target="_blank" rel="noreferrer">
            <span aria-hidden className="text-2xl">💡</span>
            <div>
              <div className="font-semibold">Content Ideas</div>
              <div className="text-[13px] text-muted">Everything you say to Siri lands here, marked Inbox</div>
            </div>
          </a>
          <a className="flex items-center gap-3 rounded-2xl border border-line bg-panel-2 p-4 hover:border-accent/60" href={s.taskDb.url} target="_blank" rel="noreferrer">
            <span aria-hidden className="text-2xl">✅</span>
            <div>
              <div className="font-semibold">To-dos</div>
              <div className="text-[13px] text-muted">Things to do — with Done, Due and Priority, marked Inbox</div>
            </div>
          </a>
        </div>
        <Button onClick={next}>Next →</Button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <p className="text-[17px] leading-relaxed text-ink/80">
        Pick any page in your Notion to be the <strong className="text-ink">home</strong> for your idea databases.
        I&apos;ll build both of them for you, with the right columns already set up.
      </p>

      {/* Two panels, in the order they happen: everything in Notion first, then
          everything here — the old single list made people hunt for the button. */}
      <section className="overflow-hidden rounded-2xl border border-line">
        <header className="flex items-baseline gap-3 border-b border-line bg-brand-cocoa px-5 py-4 text-brand-cream">
          <span className="squircle flex h-8 w-8 shrink-0 items-center justify-center bg-brand-yellow text-[14px] font-bold text-ink">
            A
          </span>
          <div>
            <div className="font-semibold">Over in Notion</div>
            <div className="text-[13px] text-brand-cream/75">
              Your key can&apos;t see a single page until you invite it to one.
            </div>
          </div>
        </header>

        <div className="space-y-5 bg-panel-2 p-5">
          <ol className="space-y-4">
            <NumberedStep n={1}>
              <strong>No page to use?</strong> In Notion&apos;s left sidebar click the <strong>+</strong> next to your
              workspace name (or <strong>New page</strong> at the bottom) and name it — <em>Second Brain</em> works. An
              empty page is fine.
            </NumberedStep>
            <NumberedStep n={2}>
              With that page open, click the <strong>•••</strong> (three dots) in the{" "}
              <strong>top-right corner</strong>.
            </NumberedStep>
            <NumberedStep n={3}>
              Scroll down to <strong>Connections</strong> (or <strong>Add connections</strong>), type{" "}
              <strong>Idea Capture</strong>, pick it, and tap <strong>Confirm</strong> / <strong>Add to page</strong>.
            </NumberedStep>
          </ol>
          <Button variant="quiet" href="https://www.notion.so">
            Open Notion in a new tab ↗
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line">
        <header className="flex items-baseline gap-3 border-b border-line bg-brand-cocoa px-5 py-4 text-brand-cream">
          <span className="squircle flex h-8 w-8 shrink-0 items-center justify-center bg-brand-yellow text-[14px] font-bold text-ink">
            B
          </span>
          <div>
            <div className="font-semibold">Back here</div>
            <div className="text-[13px] text-brand-cream/75">Fetch that page, then tap it.</div>
          </div>
        </header>

        <div className="space-y-5 bg-panel-2 p-5">
          <div>
            <Button variant={s.pages.length === 0 ? "primary" : "quiet"} full onClick={reloadPages} disabled={reloading}>
              {reloading ? (
                <>
                  <Spinner /> Asking Notion…
                </>
              ) : (
                "↻ Show me my pages"
              )}
            </Button>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Press this every time you add the connection to another page.
            </p>
          </div>

          {s.pages.length === 0 ? (
            <Callout tone="warn" title="Nothing showing yet">
              That means step A hasn&apos;t landed — the connection isn&apos;t on any page. Add it in Notion, then
              press the button again.
            </Callout>
          ) : (
            <div>
              <div className="mb-3 text-[15px] font-semibold">
                Tap the page you want <span className="text-muted">— each row is a button</span>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {s.pages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set({ parentPageId: p.id })}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left text-[15px] transition ${
                      s.parentPageId === p.id
                        ? "border-accent bg-accent/10 font-semibold"
                        : "border-line bg-panel hover:border-accent/50"
                    }`}
                  >
                    <span aria-hidden className="text-lg">
                      {s.parentPageId === p.id ? "✓" : "📄"}
                    </span>
                    <span className="truncate">{p.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {error ? <Callout tone="bad" title="Hmm">{error}</Callout> : null}

      <div className="sticky bottom-4 space-y-2">
        <Button full onClick={provision} disabled={busy || !s.parentPageId}>
          {busy ? (
            <>
              <Spinner /> Building your databases…
            </>
          ) : s.parentPageId ? (
            `Build my two databases inside “${selectedPage?.title ?? "this page"}”`
          ) : (
            "Pick a page above first"
          )}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- 5. Hosting fork */

export function HostingChoice({ s, set, next }: StepProps) {
  const options = [
    {
      id: "hosted" as const,
      icon: "⚡",
      title: "Just host it for me",
      sub: "Recommended — done in 5 seconds",
      pros: ["No accounts to make", "Nothing to maintain", "Works instantly"],
      cons: ["Your Notion key lives (encrypted) on our server"],
    },
    {
      id: "self" as const,
      icon: "🔒",
      title: "Run it on my own Vercel",
      sub: "About 3 extra minutes",
      pros: ["Your Notion key never leaves your own account", "Fully yours, forever, still free"],
      cons: ["You'll make a free Vercel account and paste 3 values"],
    },
  ];

  return (
    <div className="space-y-7">
      <p className="text-[17px] leading-relaxed text-ink/80">
        A tiny piece of code has to sit between your iPhone and Notion — it translates your idea into the format Notion
        insists on. <strong className="text-ink">Where should that live?</strong>
      </p>

      <div className="grid gap-4">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => set({ hosting: o.id })}
            className={`rounded-2xl border p-5 text-left transition ${
              s.hosting === o.id ? "border-accent bg-accent/10" : "border-line bg-panel-2 hover:border-accent/50"
            }`}
          >
            <div className="flex items-start gap-4">
              <span aria-hidden className="text-2xl">{o.icon}</span>
              <div className="min-w-0">
                <div className="font-bold">{o.title}</div>
                <div className="text-[13px] text-accent-2">{o.sub}</div>
                <ul className="mt-3 space-y-1 text-[14px] text-ink/80">
                  {o.pros.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span aria-hidden className="text-ok">✓</span>
                      {p}
                    </li>
                  ))}
                  {o.cons.map((c) => (
                    <li key={c} className="flex gap-2 text-muted">
                      <span aria-hidden>•</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </button>
        ))}
      </div>

      <Callout tone="info" title="Not sure?">
        Pick the first one. You can always come back and switch — nothing you&apos;ve built in Notion changes.
      </Callout>

      <Button onClick={next} disabled={!s.hosting}>
        Next →
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------- 6a. Hosted link */

export function HostedLink({ s, set, next, origin }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createLink() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: s.token, contentDbId: s.contentDb?.id, taskDbId: s.taskDb?.id }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; captureKey?: string };
      if (!json.ok || !json.captureKey) {
        setError(json.error ?? "Couldn't create your link.");
        return;
      }
      set({ captureKey: json.captureKey });
    } catch {
      setError("Something went wrong creating your link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const url = captureUrl(s, origin);

  return (
    <div className="space-y-7">
      {!s.captureKey ? (
        <>
          <p className="text-[17px] leading-relaxed text-ink/80">
            One tap and you&apos;ll get your own private <strong className="text-ink">capture link</strong>. That link
            is the address your iPhone sends ideas to.
          </p>
          {error ? <Callout tone="bad" title="Hmm">{error}</Callout> : null}
          <Button onClick={createLink} disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Creating…
              </>
            ) : (
              "Create my capture link"
            )}
          </Button>
        </>
      ) : (
        <>
          <div className="pop text-center text-5xl" aria-hidden>
            🔗
          </div>
          <Callout tone="good" title="This is your capture link">
            It has to end up on the iPhone that will hold the shortcut, so scan the square below with that phone. Keep
            it private — anyone with it could add rows to your idea databases.
          </Callout>
          <PhoneHandoff url={url} label="Scan this with your iPhone" />
          <details className="rounded-2xl border border-line bg-panel-2 p-5">
            <summary className="cursor-pointer text-sm font-semibold">Already on the phone? Show me the raw link</summary>
            <div className="mt-4">
              <Copyable label="Your capture link" value={url} />
            </div>
          </details>
          <Button onClick={next}>Next →</Button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- 6b. Self deploy */

export function SelfDeploy({ s, set, next }: StepProps) {
  const ready = s.selfBaseUrl.trim().length > 0;
  return (
    <div className="space-y-7">
      <p className="text-[17px] leading-relaxed text-ink/80">
        You&apos;re putting your own copy of the translator on Vercel — a free service that runs small bits of code on
        the internet. <strong className="text-ink">Your Notion key stays in your account.</strong>
      </p>

      <ol className="space-y-4">
        <NumberedStep n={1}>
          Tap the button below. Sign in to Vercel with GitHub, Google or email — it&apos;s free, no card.
        </NumberedStep>
        <NumberedStep n={2}>
          Vercel will ask you for three values. Copy each one from below and paste it into the matching box.
        </NumberedStep>
        <NumberedStep n={3}>
          Hit <strong>Deploy</strong> and wait about a minute for the confetti.
        </NumberedStep>
        <NumberedStep n={4}>
          Copy your new site&apos;s address (it looks like <span className="font-mono text-accent-2">idea-capture-xyz.vercel.app</span>) and paste it at the bottom of this page.
        </NumberedStep>
      </ol>

      <Button href={vercelDeployUrl()}>Open Vercel and deploy →</Button>

      <div className="space-y-4 rounded-2xl border border-line bg-panel-2 p-5">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted">The three values to paste</div>
        <Copyable label="NOTION_TOKEN" value={s.token} />
        <Copyable label="CONTENT_DB_ID" value={s.contentDb?.id ?? ""} />
        <Copyable label="TASK_DB_ID" value={s.taskDb?.id ?? ""} />
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-panel-2 p-5">
        <Field
          label="Paste your new Vercel address"
          hint="Just the domain is fine — I'll add the rest."
          value={s.selfBaseUrl}
          onChange={(v) => set({ selfBaseUrl: v })}
          placeholder="https://idea-capture-xyz.vercel.app"
        />
      </div>

      <Button onClick={next} disabled={!ready}>
        Next →
      </Button>
    </div>
  );
}

/* --------------------------------------------------------------- 7/8. Shortcuts */

function ShortcutBuild({ s, origin, kind }: { s: WizardState; origin: string; kind: "content" | "task" }) {
  const url = captureUrl(s, origin);
  const shortUrl = url.split("?")[0];
  const isTask = kind === "task";
  const name = isTask ? "Capture To-do" : "Capture Idea";
  const phrase = isTask ? "capture to-do" : "capture idea";
  const readyMade = SHORTCUT_LINKS[kind];

  return (
    <div className="space-y-7">
      <p className="text-[17px] leading-relaxed text-ink/80">
        {isTask ? (
          <>
            Same thing again, one word different. This one files the things you have to <em>do</em> into{" "}
            <strong className="text-ink">To-dos</strong> — &ldquo;email the accountant&rdquo;, not &ldquo;reel about
            pricing&rdquo;.
          </>
        ) : (
          <>
            Now the fun bit — the button you&apos;ll actually use. Open the{" "}
            <strong className="text-ink">Shortcuts</strong> app on your iPhone.
          </>
        )}
      </p>

      {readyMade ? (
        <div className="space-y-4 rounded-2xl border border-line bg-panel-2 p-5">
          <div className="text-sm font-semibold">The two-tap way</div>
          <p className="text-[14px] leading-relaxed text-muted">
            The shortcut is already built. Add it, then paste your own capture link into it — that link is what points
            it at <em>your</em> Notion, so nothing of yours is shared and nothing of anyone else&apos;s reaches you.
          </p>
          <a
            className="inline-flex items-center rounded-xl bg-accent px-4 py-2 text-[15px] font-semibold text-brand-cream"
            href={readyMade}
            target="_blank"
            rel="noreferrer"
          >
            Add “{name}” to my iPhone
          </a>
          <PhoneHandoff url={readyMade} label="On a laptop? Scan this with your iPhone" mode="install" />
          <ol className="space-y-3 pt-1">
            <NumberedStep n={1}>
              Tap the button (on the iPhone) → the shortcut opens → <strong>Add Shortcut</strong>.
            </NumberedStep>
            <NumberedStep n={2}>
              <strong>Paste in the link you just copied</strong> — the long one from the previous screen, the one that
              starts with <span className="font-mono">https://</span> and ends in{" "}
              <span className="font-mono">?key=…</span>. Open the shortcut, tap the very first action (the{" "}
              <strong>Text</strong> one saying <span className="font-mono">PASTE_YOUR_CAPTURE_LINK_HERE</span>), select
              everything in it and paste over it. That&apos;s the only edit — leave the{" "}
              <strong>Get Contents of URL</strong> boxes alone, they read your link from that one place. Lost it?
              It&apos;s at the bottom of this page too.
            </NumberedStep>
            <NumberedStep n={3}>
              Run it once. It shows you what the server said, so if something&apos;s wrong you&apos;ll see it in plain
              English instead of a silent tick. Then say{" "}
              <span className="text-accent-2">&ldquo;Hey Siri, {phrase}&rdquo;</span> from then on, or share a link to
              it from Instagram.
            </NumberedStep>
            {isTask ? (
              <NumberedStep n={4}>
                This one asks two things: what you have to do, then <strong>when it&apos;s due</strong>. Answer that
                out loud however you&apos;d say it — <em>tomorrow</em>, <em>Friday</em>, <em>in 3 days</em>, a real
                date — or say <em>none</em> to leave it empty. It lands in the Due column in Notion.
              </NumberedStep>
            ) : null}
          </ol>
          {url ? <Copyable label="Your capture link — goes in that one Text box" value={url} /> : null}
        </div>
      ) : null}

      <details className="rounded-2xl border border-line bg-panel-2 p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          {readyMade ? "Rather build it by hand? (or on Android)" : "Build it by hand"}
        </summary>

        <ol className="mt-5 space-y-4">
        <NumberedStep n={1}>
          Tap <strong>+</strong> in the top right to start a new shortcut.
        </NumberedStep>
        <NumberedStep n={2}>
          Search for <strong>Ask for Input</strong> and add it. Set the prompt to{" "}
          <em>&ldquo;What&apos;s the idea?&rdquo;</em>
        </NumberedStep>
        <NumberedStep n={3}>
          Search for <strong>Get Contents of URL</strong> and add it. Paste your capture link into its URL box.
        </NumberedStep>
        <NumberedStep n={4}>
          Tap the arrow to expand it. Set <strong>Method</strong> to <strong>POST</strong>, and{" "}
          <strong>Request Body</strong> to <strong>JSON</strong>.
        </NumberedStep>
        <NumberedStep n={5}>
          Tap <strong>Add new field</strong>. A little menu appears offering{" "}
          <span className="text-muted">Text, Number, Array, Dictionary, Boolean</span> — that&apos;s just asking what
          kind of thing you&apos;re about to type. <strong>Choose Text</strong>. Then do it a second time, and choose{" "}
          <strong>Text</strong> again. You want two Text fields, filled in like this:
          <div className="mt-3 overflow-hidden rounded-xl border border-line bg-panel-2 text-[13px]">
            <div className="grid grid-cols-[64px_1fr_1fr] gap-2 border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span>Type</span>
              <span>Key</span>
              <span>Value</span>
            </div>
            <div className="grid grid-cols-[64px_1fr_1fr] items-center gap-2 border-b border-line px-4 py-3 font-mono">
              <span className="text-muted">Text</span>
              <span>idea</span>
              <span className="text-accent-2">Provided Input</span>
            </div>
            <div className="grid grid-cols-[64px_1fr_1fr] items-center gap-2 px-4 py-3 font-mono">
              <span className="text-muted">Text</span>
              <span>type</span>
              <span className="text-accent-2">{kind}</span>
            </div>
          </div>
          <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
            <p>
              <strong className="text-ink/80">Why Text and not Dictionary?</strong> Dictionary is for a box holding
              more boxes. You&apos;re typing plain words, so it&apos;s Text — both times.
            </p>
            <p>
              <strong className="text-ink/80">&ldquo;Provided Input&rdquo;</strong> isn&apos;t typed by hand. Tap the
              Value box and it appears as a small blue chip above the keyboard — tap the chip. The second value,{" "}
              <span className="font-mono">{kind}</span>, you do type out, exactly like that, all lowercase.
            </p>
          </div>
        </NumberedStep>
        <NumberedStep n={6}>
          Add one more action, <strong>Show Result</strong>, and set its value to <strong>Contents of URL</strong>.
          Without it a failed capture looks exactly like a successful one — the shortcut just finishes and says nothing.
        </NumberedStep>
        <NumberedStep n={7}>
          Name it exactly <strong>{name}</strong> — the name <em>is</em> the Siri phrase, so any extra word breaks{" "}
          <span className="text-accent-2">&ldquo;Hey Siri, {phrase}&rdquo;</span>. Then tap the info icon and switch on{" "}
          <strong>Show in Share Sheet</strong> so you can send links to it from Instagram.
        </NumberedStep>
        <NumberedStep n={8}>
          Done. Say <span className="text-accent-2">&ldquo;Hey Siri, {phrase}&rdquo;</span> and it just works.
        </NumberedStep>
        </ol>

        <div className="mt-5">
          <PhoneHandoff url={url} label="Your capture link — scan it with the phone you're building this on" />
        </div>
      </details>

      <Callout tone="warn" title="It can fail without telling you — do this once">
        <p className="mb-3">
          A shortcut that finishes with a tick has not necessarily saved anything: it never shows you what the server
          answered. Scroll to the bottom of the shortcut, add a <strong>Show Result</strong> action, and set its value
          to <strong>Contents of URL</strong>. Now every run tells you on screen what happened, in plain English.
        </p>
        <p>
          The other silent one: fixing only one of the two <strong>Get Contents of URL</strong> actions. Siri uses the
          one under <strong>Otherwise</strong>; the other runs when you share a link from another app. Both need your
          link.
        </p>
      </Callout>

      {s.captureKey ? (
        <details className="rounded-2xl border border-line bg-panel-2 p-5">
          <summary className="cursor-pointer text-sm font-semibold">
            If the Shortcut says &ldquo;The network connection was lost&rdquo;
          </summary>
          <p className="mb-3 mt-4 text-[14px] leading-relaxed text-muted">
            A few iPhones choke on the very long address. Only then, use the short form: put only{" "}
            <span className="font-mono">{shortUrl}</span> in the URL box and add a <strong>third</strong> Text field
            called <span className="font-mono">key</span> holding the key below. Watch that field — if it ends up empty
            or half-pasted, the capture silently goes nowhere, which is why the long link is the default.
          </p>
          <Copyable label="URL box" value={shortUrl} />
          <div className="mt-3">
            <Copyable label="key field value" value={s.captureKey} />
          </div>
        </details>
      ) : null}

      <Callout tone="info" title="Want the link saved too?">
        Add an <strong>If</strong> check on Shortcut Input and pass it as a third JSON field called{" "}
        <span className="font-mono">link</span>. The wizard&apos;s helper can walk you through it — just ask.
      </Callout>
    </div>
  );
}

export function ShortcutIdea({ s, next, origin }: StepProps) {
  return (
    <div className="space-y-7">
      <ShortcutBuild s={s} origin={origin} kind="content" />
      <Button onClick={next}>I built it →</Button>
    </div>
  );
}

export function ShortcutTask({ s, next, origin }: StepProps) {
  return (
    <div className="space-y-7">
      <ShortcutBuild s={s} origin={origin} kind="task" />
      <div className="flex flex-wrap gap-3">
        <Button onClick={next}>I built it →</Button>
        <Button variant="quiet" onClick={next}>
          Skip this one for now
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- 9. Test it */

export function TestIt({ s, set, next, origin }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = captureUrl(s, origin);

  async function runTest() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: "Test idea from the setup wizard \u2014 you can delete this one",
          type: "content",
          source: "Manual",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; url?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "The capture link answered, but it wasn't happy. Check the link is pasted exactly.");
        return;
      }
      set({ tested: true, testedPageUrl: json.url ?? "" });
    } catch {
      setError(
        "Couldn't reach your capture link at all. If you deployed your own, double-check the address you pasted earlier.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <p className="text-[17px] leading-relaxed text-ink/80">
        Moment of truth. This sends a fake idea through the exact same path your voice will use.
      </p>

      {s.tested ? (
        <>
          <div className="pop text-center text-6xl" aria-hidden>
            🎉
          </div>
          <Callout tone="good" title="It works">
            A test idea just landed in your Content Ideas database. Delete it whenever you like.
          </Callout>
          {s.testedPageUrl ? (
            <Button variant="ghost" href={s.testedPageUrl}>
              See it in Notion →
            </Button>
          ) : null}
          <Button onClick={next}>Finish →</Button>
        </>
      ) : (
        <>
          <Button onClick={runTest} disabled={busy || !url}>
            {busy ? (
              <>
                <Spinner /> Sending…
              </>
            ) : (
              "Send a test idea"
            )}
          </Button>
          {error ? (
            <Callout tone="bad" title="Didn't go through">
              {error} Tap <strong>Stuck? Ask me</strong> and paste this message in — I&apos;ll tell you exactly what to
              fix.
            </Callout>
          ) : null}
        </>
      )}

      <div className="rounded-2xl border border-line bg-panel-2 p-5">
        <div className="mb-2 text-sm font-semibold">Then try it for real</div>
        <p className="text-[14px] leading-relaxed text-muted">
          Say <span className="text-accent-2">&ldquo;Hey Siri, capture idea&rdquo;</span> out loud, speak any thought,
          and watch it appear in Notion.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-panel-2 p-5">
        <div className="mb-2 text-sm font-semibold">If the Shortcut says something failed</div>
        <p className="text-[14px] leading-relaxed text-muted">
          On the iPhone itself, open{" "}
          <a className="text-accent-2 underline" href="/check">
            the link checker
          </a>{" "}
          and paste the link out of your Shortcut. It tests it live and says what&apos;s wrong in plain English — no
          laptop needed.
        </p>
        <div className="mt-4 space-y-2 text-[13px] leading-relaxed text-muted">
          <p>
            <strong className="text-ink/80">&ldquo;The network connection was lost&rdquo;</strong> — the phone never
            reached the server. Open{" "}
            <span className="font-mono">{origin}/api/ping</span> in Safari on that phone:
            if that answers, the network is fine and the Shortcut action itself is the problem — build it again from
            scratch, or duplicate a Get Contents of URL action you know already works and just change the address and
            fields.
          </p>
          <p>
            <strong className="text-ink/80">&ldquo;This capture link isn&apos;t set up&rdquo;</strong> — the request
            arrived without a complete key. If you used the short form, the{" "}
            <span className="font-mono">key</span> field must hold only the text after{" "}
            <span className="font-mono">key=</span>, all ~280 characters of it, with no spaces or line breaks.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- 10. Done */

export function Done({ s, origin }: StepProps) {
  const url = captureUrl(s, origin);
  return (
    <div className="space-y-7">
      <div className="pop text-center text-6xl" aria-hidden>
        🧠
      </div>
      <p className="text-center font-hand text-[30px] leading-tight text-accent">
        Your second brain is live — you&apos;ll never lose an idea again.
      </p>

      <div className="rounded-2xl border border-line bg-panel-2 p-5">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted">Your cheat sheet</div>
        <ul className="space-y-3 text-[15px] text-ink/85">
          <li className="flex gap-3">
            <span aria-hidden>🗣️</span> <span>&ldquo;Hey Siri, capture idea&rdquo; — anywhere, hands free</span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden>📲</span> <span>Share Sheet → Capture Idea — for reels and posts you want to steal</span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden>✅</span> <span>&ldquo;Hey Siri, capture to-do&rdquo; — for things you have to do</span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden>📓</span> <span>Everything lands in Notion, sorted, waiting for you</span>
          </li>
        </ul>
      </div>

      {s.captureKey ? (
        <div className="rounded-2xl border border-line bg-panel-2 p-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">And somewhere to look</div>
          <p className="mb-4 text-[15px] leading-relaxed text-ink/85">
            Your dashboard reads the same two Notion databases and adds habits and goals on top — everything Siri
            captures shows up here, and anything you tick here changes in Notion. Bookmark it on your phone.
          </p>
          <Button full href={`${origin}/dashboard?key=${encodeURIComponent(s.captureKey)}`}>
            Open my dashboard →
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        {s.contentDb ? (
          <Button variant="ghost" full href={s.contentDb.url}>
            Open Content Ideas
          </Button>
        ) : null}
        {s.taskDb ? (
          <Button variant="ghost" full href={s.taskDb.url}>
            Open To-dos
          </Button>
        ) : null}
      </div>

      {url ? <Copyable label="Your capture link (save it somewhere)" value={url} /> : null}

      <Callout tone="info" title="One habit to build">
        Once a week, open Content Ideas and drag the good ones out of Inbox. The capturing is solved — the choosing is
        still yours.
      </Callout>
    </div>
  );
}
