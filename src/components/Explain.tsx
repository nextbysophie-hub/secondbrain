"use client";

import { ReactNode, useState } from "react";

/* ------------------------------------------------------------------ diagrams */

function Chip({ emoji, label, sub }: { emoji: string; label: string; sub?: string }) {
  return (
    <div className="flex-1 rounded-xl border border-brand-cream/25 bg-brand-cream/10 px-3 py-3 text-center">
      <div aria-hidden className="text-2xl leading-none">
        {emoji}
      </div>
      <div className="mt-2 text-[13px] font-bold text-brand-cream">{label}</div>
      {sub ? <div className="mt-1 text-[11.5px] leading-snug text-brand-cream/65">{sub}</div> : null}
    </div>
  );
}

function Arrow() {
  return (
    <div aria-hidden className="shrink-0 self-center px-1 text-brand-yellow sm:px-0">
      <span className="hidden sm:inline">→</span>
      <span className="sm:hidden">↓</span>
    </div>
  );
}

/** You → phone → errand runner → Notion. */
export function FlowDiagram() {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-2" role="img" aria-label="You speak, your phone packages it, a small program online delivers it, Notion files it">
      <Chip emoji="🗣️" label="You talk" sub="“Hey Siri, capture idea”" />
      <Arrow />
      <Chip emoji="📱" label="Your phone" sub="the Shortcut packages it" />
      <Arrow />
      <Chip emoji="☁️" label="Errand runner" sub="translates it for Notion" />
      <Arrow />
      <Chip emoji="📓" label="Notion" sub="a new row appears" />
    </div>
  );
}

/** Hosted vs your own Vercel, side by side. */
export function HostingDiagram() {
  const col = "flex-1 rounded-xl border border-brand-cream/25 bg-brand-cream/10 p-3";
  const row = "flex gap-2 text-[12.5px] leading-snug text-brand-cream/80";
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className={col}>
        <div className="mb-2 text-[13px] font-bold text-brand-yellow">☁️ Hosted for you</div>
        <div className="space-y-1.5">
          <div className={row}>
            <span aria-hidden>📱</span> your phone
          </div>
          <div className={row}>
            <span aria-hidden>↓</span> Sophie&apos;s shelf, shared
          </div>
          <div className={row}>
            <span aria-hidden>📓</span> your Notion
          </div>
        </div>
        <div className="mt-3 border-t border-brand-cream/20 pt-2 text-[12px] text-brand-cream/70">
          One tap. No sign-up. Your key rides inside your own link — nothing stored here.
        </div>
      </div>
      <div className={col}>
        <div className="mb-2 text-[13px] font-bold text-brand-yellow">🛠️ Your own Vercel</div>
        <div className="space-y-1.5">
          <div className={row}>
            <span aria-hidden>📱</span> your phone
          </div>
          <div className={row}>
            <span aria-hidden>↓</span> your shelf, yours alone
          </div>
          <div className={row}>
            <span aria-hidden>📓</span> your Notion
          </div>
        </div>
        <div className="mt-3 border-t border-brand-cream/20 pt-2 text-[12px] text-brand-cream/70">
          Ten extra minutes and a free account. Nothing of yours touches anyone else&apos;s shelf.
        </div>
      </div>
    </div>
  );
}

/** What the integration key can and can't reach. */
export function KeyDiagram() {
  return (
    <div className="rounded-xl border border-brand-cream/25 bg-brand-cream/10 p-3">
      <div className="mb-2 text-[13px] font-bold text-brand-yellow">🔑 What the key opens</div>
      <div className="space-y-1.5 text-[12.5px] leading-snug">
        <div className="flex gap-2 text-brand-cream/85">
          <span aria-hidden>✅</span> the one page you share with it — and the databases inside it
        </div>
        <div className="flex gap-2 text-brand-cream/55">
          <span aria-hidden>🚫</span> <span className="line-through decoration-brand-cream/30">every other page in your Notion</span>
        </div>
        <div className="flex gap-2 text-brand-cream/55">
          <span aria-hidden>🚫</span>{" "}
          <span className="line-through decoration-brand-cream/30">your Notion password, your email, your billing</span>
        </div>
      </div>
    </div>
  );
}

/** The shortcut's name IS the Siri phrase. */
export function PhraseDiagram() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row" role="img" aria-label="Shortcut named Capture Idea files into Content Ideas; shortcut named Capture To-do files into To-dos">
      <div className="flex-1 rounded-xl border border-brand-cream/25 bg-brand-cream/10 p-3">
        <div className="text-[12px] uppercase tracking-widest text-brand-cream/55">Shortcut named</div>
        <div className="mt-1 text-[14px] font-bold text-brand-cream">Capture Idea</div>
        <div className="mt-2 text-[12.5px] text-brand-cream/75">🗣️ “Hey Siri, capture idea”</div>
        <div className="mt-1 text-[12.5px] text-brand-yellow">📓 → Content Ideas</div>
      </div>
      <div className="flex-1 rounded-xl border border-brand-cream/25 bg-brand-cream/10 p-3">
        <div className="text-[12px] uppercase tracking-widest text-brand-cream/55">Shortcut named</div>
        <div className="mt-1 text-[14px] font-bold text-brand-cream">Capture To-do</div>
        <div className="mt-2 text-[12.5px] text-brand-cream/75">🗣️ “Hey Siri, capture to-do”</div>
        <div className="mt-1 text-[12.5px] text-brand-yellow">✅ → To-dos</div>
      </div>
    </div>
  );
}

/** Two databases, what belongs in each. */
export function DatabasesDiagram() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="flex-1 rounded-xl border border-brand-cream/25 bg-brand-cream/10 p-3">
        <div className="text-[13px] font-bold text-brand-cream">💡 Content Ideas</div>
        <div className="mt-1 text-[12.5px] leading-snug text-brand-cream/70">
          Things to <em>make</em> — “reel about pricing”, a link you saved off Instagram. A place to browse when you
          need something to post.
        </div>
      </div>
      <div className="flex-1 rounded-xl border border-brand-cream/25 bg-brand-cream/10 p-3">
        <div className="text-[13px] font-bold text-brand-cream">✅ To-dos</div>
        <div className="mt-1 text-[12.5px] leading-snug text-brand-cream/70">
          Things to <em>finish</em> — “email the accountant”. A list you clear, with Done, Due and Priority.
        </div>
      </div>
    </div>
  );
}

/** The four links in the chain a test capture proves at once. */
export function ChainDiagram() {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-2">
      <Chip emoji="📱" label="Phone" />
      <Arrow />
      <Chip emoji="⚡" label="Shortcut" />
      <Arrow />
      <Chip emoji="☁️" label="Capture link" />
      <Arrow />
      <Chip emoji="📓" label="Notion row" />
    </div>
  );
}

/* ---------------------------------------------------------------- explainers */

const EXPLAINERS: Record<string, { question: string; body: ReactNode }> = {
  welcome: {
    question: "How does this actually work?",
    body: (
      <>
        <p>Three pieces, and you only ever touch the first one.</p>
        <FlowDiagram />
        <p>
          The whole trip takes about a second. Your phone can&apos;t talk to Notion on its own — that middle piece is
          the only reason this wizard exists.
        </p>
      </>
    ),
  },
  "notion-key": {
    question: "What is an integration key, and is it safe?",
    body: (
      <>
        <p>
          Notion won&apos;t let a stranger write into your workspace, which is a good thing. An{" "}
          <strong>integration</strong> is a robot you create inside your own Notion, and its <strong>key</strong> is
          that robot&apos;s password.
        </p>
        <KeyDiagram />
        <p>
          It&apos;s a key to one room, not the house. Change your mind and you delete the integration in Notion — the
          key stops working instantly, and you never told anyone your password.
        </p>
      </>
    ),
  },
  databases: {
    question: "Why two databases instead of one?",
    body: (
      <>
        <p>Because &ldquo;reel about pricing&rdquo; and &ldquo;email the accountant&rdquo; are different animals.</p>
        <DatabasesDiagram />
        <p>
          A database in Notion is just a table. The wizard builds both with the right columns already in place, so
          nothing can be typed wrong. Mixing the two means you stop trusting either one.
        </p>
      </>
    ),
  },
  hosting: {
    question: "What is Vercel, and what's the difference between the two options?",
    body: (
      <>
        <p>
          The piece in the middle has to live somewhere that&apos;s awake 24/7 — it can&apos;t live on your phone.{" "}
          <strong>Vercel</strong> is a free service that runs little programs like that. Think of it as renting a shelf
          in a warehouse for a program the size of a Post-it.
        </p>
        <HostingDiagram />
        <p>Both behave identically day to day. You can switch later by redoing this wizard.</p>
      </>
    ),
  },
  "hosted-link": {
    question: "What is this long link, and why is it so long?",
    body: (
      <>
        <p>
          It&apos;s the address your phone sends ideas to, plus your Notion access scrambled and riding along inside it.
          That&apos;s why it&apos;s a paragraph instead of a word — and why nothing about you is stored on a server here.
        </p>
        <p>
          <strong>Treat it like a password.</strong> Anyone who has it can write into your Notion databases. Don&apos;t
          post it, don&apos;t screenshot it into a group chat.
        </p>
      </>
    ),
  },
  "self-deploy": {
    question: "What am I actually deploying?",
    body: (
      <>
        <p>
          &ldquo;Deploy&rdquo; sounds military; it just means <em>put this program online</em>. The button copies the
          code into your own free Vercel account and switches it on.
        </p>
        <p>
          The program is about a page long. Its whole job: receive &ldquo;here&apos;s an idea&rdquo; from your phone,
          translate it into the language Notion speaks, pass it on.
        </p>
        <p>
          The <strong>environment variables</strong> it asks for are just the answers it needs to do that — your Notion
          key and which databases to write to. They live in your Vercel account; nobody else sees them.
        </p>
      </>
    ),
  },
  "shortcut-idea": {
    question: "What is a Shortcut, and why does Siri need it?",
    body: (
      <>
        <p>
          <strong>Shortcuts</strong> is an app Apple already put on your iPhone. It chains a few actions together —
          &ldquo;ask me a question, then send the answer somewhere&rdquo; — with no code.
        </p>
        <p>
          Siri can&apos;t talk to Notion by herself, but she can run any shortcut by name. The name IS the voice
          command.
        </p>
        <PhraseDiagram />
        <p>
          Share Sheet is the same shortcut wearing a second hat: tap Share on a reel and iOS offers it in the list, with
          the reel&apos;s link riding along.
        </p>
      </>
    ),
  },
  "shortcut-task": {
    question: "Why a second shortcut instead of one that asks?",
    body: (
      <>
        <p>
          Because a shortcut that asks &ldquo;idea or to-do?&rdquo; costs you a tap every single time — and you&apos;re
          usually driving or half-asleep when you use it. Two shortcuts means the choice already happened in the words
          you said.
        </p>
        <PhraseDiagram />
        <p>Under the hood they&apos;re identical except for one word: the word that picks the database.</p>
      </>
    ),
  },
  test: {
    question: "Why test before I trust it?",
    body: (
      <>
        <p>
          Because the failure mode is silent. Wired wrong, you find out weeks later, hunting for an idea that never
          arrived.
        </p>
        <ChainDiagram />
        <p>One test capture proves all four at once. If the row shows up, you can stop thinking about this forever.</p>
      </>
    ),
  },
  done: {
    question: "What just happened, in one paragraph?",
    body: (
      <>
        <p>
          You made a robot inside your Notion and gave it a key. You built two tables for it to write into. You put a
          tiny program online that knows how to speak Notion. Then you taught Siri two phrases that send your words to
          that program.
        </p>
        <p>
          Nothing runs on a subscription and nothing depends on you remembering how it works. If it ever breaks,
          it&apos;s almost always the capture link — redo this wizard and paste the fresh one in.
        </p>
      </>
    ),
  },
};

/** Brown explainer panel: cream text on cocoa, used open and closed. */
function BrownPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-brand-cocoa p-5 text-brand-cream shadow-[0_10px_30px_-18px_rgba(70,46,41,0.9)]">
      <div className="space-y-3 text-[14.5px] leading-relaxed text-brand-cream/90">{children}</div>
    </div>
  );
}

/** The brown "explain it to me" button that sits under each step's heading. */
export function Explain({ stepId }: { stepId: string }) {
  const [open, setOpen] = useState(false);
  const entry = EXPLAINERS[stepId];
  if (!entry) return null;

  return (
    <div className="mb-7">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-cocoa px-4 py-2.5 text-[14px] font-semibold text-brand-cream transition hover:brightness-125"
      >
        <span aria-hidden>🤔</span>
        {entry.question}
        <span aria-hidden className={`text-[11px] transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open ? (
        <div className="slide-in mt-3">
          <BrownPanel>{entry.body}</BrownPanel>
        </div>
      ) : null}
    </div>
  );
}

/** Screen 2 gets the same idea, but always open — it's the step where the logic belongs. */
export function LogicForDummies() {
  return (
    <BrownPanel>
      <div className="mb-1 font-hand text-[26px] leading-none text-brand-yellow">The logic, for dummies</div>
      <FlowDiagram />
      <p>
        That&apos;s it. Everything you&apos;re about to do is plugging those four things into each other — and this
        wizard does the fiddly parts for you.
      </p>
      <p>
        <strong className="text-brand-cream">The one thing worth understanding:</strong> nothing here is a
        subscription, an app, or a service watching you. It&apos;s your Notion, your phone, and about a page of code
        sitting in the middle.
      </p>
    </BrownPanel>
  );
}
