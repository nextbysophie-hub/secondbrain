"use client";

import { useState } from "react";
import { GuideSpec } from "@/components/Guide";
import { Checklist, Copy, Go, Note, Ref, Taps } from "@/components/GuideKit";

const HIRE =
  "Your job is Inbox Bouncer. You guard my email so I never have to open it. Every time you run, you read my new email, let in only what needs me (a real ask, a deadline, a question aimed at me, money owed to me or by me), and write each one as a to-do in my Notion database \"Inbox to-dos\" with a link back to the email. Everything else stays out of my sight. Never send, reply, forward or delete anything without asking me first. Remember this job and these boundaries.";

const HOME =
  "In my Notion, create a database called \"Inbox to-dos\" with these columns: Task (title), Done (checkbox), Due (date), From (text), Email link (URL), Type (select: Reply, Do, Pay, Read, Calendar), Notes (text). Then add one example row so I can see what it looks like.";

const DRY_RUN =
  "Before we automate anything, do one practice run right now on my email from the last 3 days. Show me: (1) the to-dos you would let in, (2) 5 examples of what you'd keep out and why. Do NOT write to Notion or change any email yet.";

const ROUTINE =
  "That looks right. Set up a routine to do this every 2 hours, from 7am to 9pm, in my time zone. Each run, only look at email that arrived since the last run, skip anything already in \"Inbox to-dos\", and never send, reply, forward or delete without asking me. If Gmail or Notion is disconnected, message me instead of skipping quietly. Show me the schedule before you turn it on.";

const ASK_FIRST =
  "From now on, always ask me first before you send, reply, forward, delete or unsubscribe from anything. Labelling and archiving are fine without asking.";

type AddOn = { id: string; name: string; what: string; prompt: string };

const ADD_ONS: AddOn[] = [
  {
    id: "voice",
    name: "The Ghostwriter",
    what: "Drafts replies that sound like you. They sit in Drafts until you hit send.",
    prompt:
      "Read the last 30 emails I SENT and write a short note on how I write: greeting, sign-off, length, emojis, how I say no. Save it as my \"email voice\". From now on, for every to-do with Type = Reply, write a draft reply in my voice and leave it in Gmail Drafts. Put \"draft ready\" in Notes. Never send it.",
  },
  {
    id: "money",
    name: "The Money Catcher",
    what: "Invoices, payments, brand deals and refunds never get buried again.",
    prompt:
      "Any email about money (an invoice to me, an invoice I sent, a payment received, a refund, a brand deal offer with a fee) becomes a to-do with Type = Pay, the amount and currency at the start of the Task, and the due date in Due. Every Monday at 9am, send me one message: what I owe, what I'm owed, and anything overdue.",
  },
  {
    id: "vip",
    name: "The VIP Line",
    what: "Only the people who matter can tap you on the shoulder, straight away.",
    prompt:
      "Set up a routine that runs whenever I get an email from one of my VIPs (listed in my house rules). Message me right away with who it's from and one line on what they need. For everyone else, wait for the normal 2-hour run.",
  },
  {
    id: "calendar",
    name: "The Date Catcher",
    what: "Appointments, calls and deadlines go into your calendar, not your memory.",
    prompt:
      "When an email has a real appointment, call or event with a date and time (not a sale ending or a webinar ad), make a to-do with Type = Calendar and ask me \"add to calendar?\". If I say yes, create the event in Google Calendar with the email link in the description.",
  },
  {
    id: "sweep",
    name: "The Unsubscribe Sweep",
    what: "Once a month, it finds the newsletters you never open and offers to cut them.",
    prompt:
      "On the 1st of every month, list the senders I got 4+ emails from last month and never opened or replied to. Show them as a numbered list. Ask me which numbers to unsubscribe from, then only unsubscribe from the ones I pick.",
  },
  {
    id: "friday",
    name: "The Friday Recap",
    what: "One message on Friday: what you handled, what's waiting, what you can ignore.",
    prompt:
      "Every Friday at 4pm, message me a recap: how many emails came in this week, how many became to-dos, which to-dos are still not Done, and the 3 most important things waiting on me. Keep it under 10 lines.",
  },
];

const TROUBLE: [string, string][] = [
  [
    "It didn't run",
    "Open the Bot, tap the routine and check it's Active (not Paused) and that \"When to run\" says every 2 hours in your time zone. A new routine waits for its first scheduled time, so use Test on the desktop app to try it now.",
  ],
  [
    "It says Gmail or Notion is missing",
    "Connect apps → tap the app. If it says Needs auth or Disconnected, tap Authenticate (Authorize on the phone) and sign in again.",
  ],
  [
    "It asked me something and then gave up",
    "Approvals from a routine expire after about 30 minutes. Turn on notifications for this Bot so you see them in time.",
  ],
  [
    "It let junk in",
    "Reply in the Bot's chat: \"From now on, keep emails like this out: …\" and paste the subject. It remembers.",
  ],
  [
    "It kept something important out",
    "Add the sender to your VIPs in the house rules below, copy the new rules and paste them in the Bot's chat.",
  ],
];

const field =
  "w-full rounded-xl border border-line bg-white/70 px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted/70 focus:border-accent";

/** Her answers become the one paragraph of rules the Bouncer works from. */
function HouseRules() {
  const [vips, setVips] = useState("");
  const [noise, setNoise] = useState("");
  const [always, setAlways] = useState("");
  const [archive, setArchive] = useState(true);
  const lines = [
    "Here are my house rules. Remember them.",
    vips.trim() ? `VIPs (always let in, even if it looks small): ${vips.trim()}.` : "",
    noise.trim() ? `Always keep out: ${noise.trim()}.` : "",
    "Also keep out: newsletters, promotions, receipts with nothing to do, social notifications, and threads where I'm only CC'd and nobody asks me anything.",
    always.trim() ? `Always let in: ${always.trim()}.` : "",
    "Let in: anything that asks me to do, decide, reply, pay or attend something, and any question aimed at me that has no reply yet.",
    "For each to-do: Task starts with a verb and says exactly what to do (\"Reply to Ana about the shoot date\", not \"Email from Ana\"). Set Due if the email has a deadline. Set Type.",
    archive
      ? "After each run, mark what you kept out as read and archive it with the label \"Bouncer\" so I can check it if I ever need to. Never delete it."
      : "Don't touch what you kept out: leave it in my inbox unread.",
  ].filter(Boolean);
  return (
    <div className="space-y-3 rounded-3xl border border-line bg-panel p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">your house rules</div>
      <label className="block text-[13px] font-semibold">
        Who are your VIPs?
        <input className={`${field} mt-1`} value={vips} onChange={(e) => setVips(e.target.value)} placeholder="my manager, mom, anyone from @nike.com" />
      </label>
      <label className="block text-[13px] font-semibold">
        What should never get in?
        <input className={`${field} mt-1`} value={noise} onChange={(e) => setNoise(e.target.value)} placeholder="Shein, LinkedIn, 'quick question' cold pitches" />
      </label>
      <label className="block text-[13px] font-semibold">
        Anything that must always get in?
        <input className={`${field} mt-1`} value={always} onChange={(e) => setAlways(e.target.value)} placeholder="brand deal offers, school emails, anything with 'contract'" />
      </label>
      <label className="flex items-center gap-2 text-[13.5px]">
        <input type="checkbox" checked={archive} onChange={(e) => setArchive(e.target.checked)} className="h-4 w-4 accent-[var(--brand-cocoa)]" />
        Archive the noise for me (it&apos;s never deleted, just out of sight)
      </label>
      <Copy label="paste this in your bouncer's chat" text={lines.join("\n")} />
    </div>
  );
}

function AddOnShelf() {
  const [open, setOpen] = useState<string>(ADD_ONS[0].id);
  return (
    <div className="space-y-2">
      {ADD_ONS.map((a, i) => (
        <div key={a.id} className={`rounded-2xl border ${open === a.id ? "border-brand-cocoa bg-panel-2" : "border-line bg-panel"}`}>
          <button
            type="button"
            onClick={() => setOpen(open === a.id ? "" : a.id)}
            className="flex w-full items-start gap-3 px-4 py-3 text-left"
          >
            <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-cocoa text-[12px] font-bold text-brand-cream">
              {i + 1}
            </span>
            <span className="text-[14.5px] leading-snug">
              <strong className="font-bold">{a.name}</strong>
              <span className="block text-muted">{a.what}</span>
            </span>
          </button>
          {open === a.id ? (
            <div className="px-4 pb-4">
              <Copy label="paste this in your bouncer's chat" text={a.prompt} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Before() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-line bg-panel px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">inbox zero</div>
        <p className="mt-1 text-[14px] leading-snug">
          You open 200 emails, read them all, sort them, feel behind, and do it again tomorrow.
        </p>
      </div>
      <div className="rounded-2xl border-2 border-brand-cocoa bg-panel-2 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">inbox never</div>
        <p className="mt-1 text-[14px] leading-snug">
          You don&apos;t open it. A bouncer reads it every 2 hours and hands you 5 to-dos.
        </p>
      </div>
    </div>
  );
}

export const EMAIL_KIT: GuideSpec = {
  slug: "email-kit",
  label: "Copy My Email Kit",
  freebie: "Copy My Email Kit",
  open: true,
  headline: (
    <>
      Stop checking
      <br />
      your email.
    </>
  ),
  frameTitle: (
    <>
      Copy my <span className="text-accent">email</span> setup.
    </>
  ),
  promise: "Skip the course. Copy my setup. One afternoon, no code, and you never open your inbox again.",
  goal: (
    <>
      <p>
        Inbox zero is a lie: it&apos;s a full-time job you do for free. By the end of this kit your inbox has a{" "}
        <span className="text-accent">bouncer</span>. Every 2 hours it reads everything, lets in only what needs
        you, and turns it into a short to-do list in Notion. The rest never reaches you.
      </p>
      <p className="mt-3 text-[14px] font-medium leading-relaxed text-muted">
        This is the exact setup I run. Works with Gmail or Outlook (as many inboxes as you have), Notion and Grok
        Bot on your phone or laptop.
      </p>
    </>
  ),
  stats: [
    ["1 afternoon", "to set up"],
    ["every 2 hrs", "it checks for you"],
    ["6 add-ons", "for after"],
  ],
  outline: [
    ["Inbox zero vs inbox never", "why you stop opening it"],
    ["Hire your bouncer", "one Bot, one job"],
    ["Give it the keys", "your inboxes + Notion"],
    ["Make its list", "where your to-dos land"],
    ["Write the house rules", "who gets in, who doesn't"],
    ["Practice run", "watch it sort before you trust it"],
    ["Put it on shift", "every 2 hours, on its own"],
    ["The add-on shelf", "6 extras that make it feel like an assistant"],
    ["If it acts up", "the five fixes"],
  ],
  gateAt: 99,
  steps: [
    {
      id: "why",
      kicker: "Step 0",
      title: "Inbox zero vs inbox never",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Every productivity course teaches you to <strong className="font-bold">get better at email</strong>.
            Folders, filters, the 2-minute rule. This kit does the opposite: you stop doing email. Something
            else reads it.
          </p>
          <Before />
          <p className="text-[15px] leading-relaxed">Before you start, have these ready:</p>
          <Checklist
            id="email-kit-ready"
            items={[
              "Grok Bot on my phone or laptop (it's included with X Subscription Premium and up, and some accounts get a free trial)",
              "My email login(s): Gmail, Outlook, or both",
              "A Notion account (free is fine)",
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Go href="https://docs.x.ai/grok-bot/faq">get grok bot</Go>
            <Go href="https://www.notion.com/signup">free notion account</Go>
          </div>
          <Note>
            Your bouncer never sends, replies or deletes anything without asking you first. You&apos;ll set that
            rule in the next steps, and it stays on.
          </Note>
        </div>
      ),
    },
    {
      id: "hire",
      kicker: "Step 1",
      title: "Hire your bouncer",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            In Grok Bot, every job gets its own Bot. This one has one job:{" "}
            <strong className="font-bold">guard your inbox</strong>.
          </p>
          <Taps
            steps={[
              <>Open Grok Bot and tap the <strong className="font-bold">+</strong> (new chat), then <strong className="font-bold">Create new Bot</strong>.</>,
              <>Paste the job description below as your first message and send it.</>,
              <>Tap the Bot&apos;s name at the top and rename it <strong className="font-bold">Inbox Bouncer</strong>.</>,
            ]}
          />
          <Copy label="its job description" text={HIRE} />
        </div>
      ),
    },
    {
      id: "keys",
      kicker: "Step 2",
      title: "Give it the keys",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Connect every inbox you have, plus Notion. Got a work Gmail and a personal one? Connect both: the
            bouncer watches them all and gives you <strong className="font-bold">one list</strong>.
          </p>
          <Taps
            steps={[
              <>On the phone: tap your picture (top left) → <strong className="font-bold">Connect apps</strong>. On the laptop: <strong className="font-bold">Connect apps</strong> in the sidebar.</>,
              <>Search <strong className="font-bold">Gmail</strong> (or Outlook), add it, tap <strong className="font-bold">Authorize</strong> and sign in.</>,
              <>Do the same for <strong className="font-bold">Notion</strong>. When Notion asks which pages to share, pick the page where you want your to-dos to live.</>,
              <>Check all of them say <strong className="font-bold">Installed</strong>. If one says Needs auth, tap it and sign in again.</>,
            ]}
          />
          <Note>
            Shortcut: you can just tell your bouncer &ldquo;Add the Gmail app&rdquo; and it shows you a Connect
            button.
          </Note>
        </div>
      ),
    },
    {
      id: "home",
      kicker: "Step 3",
      title: "Make its list",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            This is the only thing you look at from now on: one Notion list. Your bouncer builds it for you.
          </p>
          <Copy label="paste this in your bouncer's chat" text={HOME} />
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-left text-[13.5px]">
              <thead className="bg-panel text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-3 py-2">task</th>
                  <th className="px-3 py-2">type</th>
                  <th className="px-3 py-2">due</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Reply to Ana about the shoot date", "Reply", "Thu"],
                  ["$1,200: pay invoice #4482", "Pay", "Nov 5"],
                  ["Sign the Nike contract", "Do", "Fri"],
                  ["Vet appointment 3pm", "Calendar", "Mon"],
                ].map((r) => (
                  <tr key={r[0]} className="border-t border-line">
                    <td className="px-3 py-2">{r[0]}</td>
                    <td className="px-3 py-2 text-muted">{r[1]}</td>
                    <td className="px-3 py-2 text-muted">{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>
            That&apos;s what a whole day of email looks like after the bouncer. Four lines.
          </Note>
        </div>
      ),
    },
    {
      id: "rules",
      kicker: "Step 4",
      title: "Write the house rules",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Every bouncer has a list. Fill in yours and you get one paragraph to paste. Leave a box empty if you
            don&apos;t know yet: the defaults already keep out newsletters, promos and CC threads.
          </p>
          <HouseRules />
          <Note>You can change the rules any time: fill them in again and paste the new version.</Note>
        </div>
      ),
    },
    {
      id: "practice",
      kicker: "Step 5",
      title: "Practice run",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Before it touches anything, watch it sort the last 3 days.{" "}
            <strong className="font-bold">Nothing gets written or archived yet.</strong>
          </p>
          <Copy label="paste this in your bouncer's chat" text={DRY_RUN} />
          <Taps
            steps={[
              <>Read the to-dos it would let in. Is anything missing? Tell it: &ldquo;This one should have gotten in: …&rdquo;</>,
              <>Read what it kept out. Anything wrong? &ldquo;Always let in emails like this one.&rdquo;</>,
              <>Ask it to run the practice again until the list looks like your real day.</>,
            ]}
          />
        </div>
      ),
    },
    {
      id: "shift",
      kicker: "Step 6",
      title: "Put it on shift",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Now it works on its own, every 2 hours, even when your laptop is closed.
          </p>
          <Copy label="1. the schedule" text={ROUTINE} />
          <Copy label="2. the safety rule" text={ASK_FIRST} />
          <Taps
            steps={[
              <>Open the Bot&apos;s profile → <strong className="font-bold">Routines</strong> and check &ldquo;When to run&rdquo; says every 2 hours in your time zone.</>,
              <>A new routine waits for its first time slot. On the laptop app, tap <strong className="font-bold">Test</strong> to see it run now.</>,
              <>Turn on notifications for this Bot so you see it when it asks you something.</>,
            ]}
          />
          <Note>
            Want it to run more or less often? Just tell it: &ldquo;Change the inbox routine to every hour.&rdquo;
          </Note>
        </div>
      ),
    },
    {
      id: "addons",
      kicker: "Step 7",
      title: "The add-on shelf",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Your bouncer works. These are the extras that make it feel like a real assistant. Add one a week,
            or all six today.
          </p>
          <AddOnShelf />
        </div>
      ),
    },
    {
      id: "fixes",
      kicker: "Step 8",
      title: "If it acts up",
      Body: () => (
        <div className="space-y-5">
          <div className="space-y-2">
            {TROUBLE.map(([q, a]) => (
              <div key={q} className="rounded-2xl border border-line bg-panel px-4 py-3">
                <div className="text-[14.5px] font-bold">{q}</div>
                <p className="mt-1 text-[14px] leading-snug text-muted">{a}</p>
              </div>
            ))}
          </div>
          <p className="text-[15px] leading-relaxed">
            Still stuck? <Ref href="https://nextbysophie.com/answers">Ask me here</Ref> and I&apos;ll answer you.
          </p>
        </div>
      ),
    },
  ],
};
