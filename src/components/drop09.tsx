"use client";

import { useState } from "react";
import { GuideSpec } from "@/components/Guide";
import { Checklist, Copy, Go, Note, Ref, Taps } from "@/components/GuideKit";

const DAD =
  "Every Sunday at 6pm, count the reels I posted on Instagram this week (check my Notion \"Content\" database for rows with Status = Posted and a date in the last 7 days). My pace is 3 a week. If I posted fewer than 3, send me a short Slack message like a proud dad checking in: how many I did, how many I'm behind, and one encouraging line. If I hit 3 or more, stay silent — do not message me at all.";

const PACE =
  "Create a Notion database called \"Content\" with these columns: Title (title), Status (select: Idea, Filming, Posted), Posted on (date), Platform (select: Instagram, TikTok, YouTube). Add the three reels I posted this week as examples marked Posted with their dates.";

const DRY_RUN =
  "Before you schedule anything, run this check once right now and show me your work: how many posts you counted, which rows you counted, and the exact message you would send. Do NOT send it yet.";

const SCHEDULE =
  "That's right. Now run this check every Sunday at 6pm on its own. Only message me when the condition is true. Keep a one-line log of every check (date, count, fired or silent) in a Notion page called \"Intervention log\". Show me the schedule before you turn it on.";

const EXAMPLES: [string, string, string, string][] = [
  ["videos posted", "3 a week", "fewer than 3 by Sunday 6pm", "Slack message with the count"],
  ["workouts", "PT Mon / Wed / Fri", "2 or more missed in a week", "push notification"],
  ["unpaid invoices", "paid within 30 days", "any invoice 10+ days late", "a drafted follow-up email to approve"],
  ["my calendar", "no more than 4 meetings a day", "any day next week with 5+", "a message with which ones to move"],
];

/** The four steps of the script, answered on the page, become the one
 *  paragraph you hand the agent. */
function Builder() {
  const [watch, setWatch] = useState("");
  const [normal, setNormal] = useState("");
  const [trigger, setTrigger] = useState("");
  const [fires, setFires] = useState("");
  const [when, setWhen] = useState("Every Sunday at 6pm");
  const ready = watch.trim() && normal.trim() && trigger.trim() && fires.trim();
  const prompt = ready
    ? `${when.trim() || "Every Sunday at 6pm"}, check ${watch.trim()}. Normal is ${normal.trim()}. If ${trigger.trim()}, ${fires.trim()}. Otherwise stay completely silent — do not message me at all. Before the first real run, show me what you counted and what you would send.`
    : "";
  const field =
    "w-full rounded-xl border border-line bg-white/70 px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted/70 focus:border-accent";
  const fill = (e: (typeof EXAMPLES)[number]) => {
    setWatch(e[0]);
    setNormal(e[1]);
    setTrigger(e[2]);
    setFires(`send me a ${e[3]}`);
  };
  return (
    <div className="space-y-3 rounded-3xl border border-line bg-panel p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
        answer the four, get your agent
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => (
          <button
            key={e[0]}
            type="button"
            onClick={() => fill(e)}
            className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted transition hover:border-accent hover:text-ink"
          >
            {e[0]}
          </button>
        ))}
      </div>
      <label className="block text-[13px] font-semibold">
        1. What does it watch?
        <input className={`${field} mt-1`} value={watch} onChange={(e) => setWatch(e.target.value)} placeholder="how many reels I posted this week" />
      </label>
      <label className="block text-[13px] font-semibold">
        2. What does normal look like?
        <input className={`${field} mt-1`} value={normal} onChange={(e) => setNormal(e.target.value)} placeholder="3 reels a week" />
      </label>
      <label className="block text-[13px] font-semibold">
        3. The trigger (a condition, not a time)
        <input className={`${field} mt-1`} value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="I've posted fewer than 3 by Sunday evening" />
      </label>
      <label className="block text-[13px] font-semibold">
        4. What happens when it fires?
        <input className={`${field} mt-1`} value={fires} onChange={(e) => setFires(e.target.value)} placeholder="send me a short Slack message with the count and one encouraging line" />
      </label>
      <label className="block text-[13px] font-semibold">
        How often does it check? (it only talks if 3 is true)
        <input className={`${field} mt-1`} value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      {ready ? (
        <Copy label="your intervention agent, in one paragraph" text={prompt} />
      ) : (
        <p className="text-[12.5px] text-muted">Fill in all four and your prompt shows up here.</p>
      )}
    </div>
  );
}

export const DROP09: GuideSpec = {
  slug: "drop09",
  label: "Drop 09",
  freebie: "Drop 09 — The Sunday call",
  open: true,
  headline: (
    <>
      An agent
      <br />
      that only
      <br />
      speaks up.
    </>
  ),
  frameTitle: (
    <>
      Build the <span className="text-accent">Sunday call</span> agent.
    </>
  ),
  promise: "15 minutes. One thing to watch, one rule, and an agent that stays quiet until you slip.",
  goal: (
    <>
      <p>
        My dad called every Sunday and asked about my 3 weekly reels. That&apos;s it. By the end of this page
        you&apos;ll have an agent that does <span className="text-accent">exactly what he did</span>: watches one
        number, knows what normal is, and only taps you on the shoulder when you&apos;re behind.
      </p>
      <p className="mt-3 text-[14px] font-medium leading-relaxed text-muted">
        Part 9 of AI Agents for Dummies. Works in Claude Code (or Claude&apos;s scheduled tasks) with Notion
        connected. The whole guide is open &mdash; no email needed.
      </p>
    </>
  ),
  stats: [
    ["15 min", "start to finish"],
    ["1", "thing to watch"],
    ["0", "messages when you're on track"],
  ],
  outline: [
    ["Why this isn't a reminder", "a nag vs. a dad"],
    ["Step one: pick what to watch", "one thing, to start"],
    ["Step two: define normal", "the baseline it compares to"],
    ["Step three: the trigger, not the clock", "a condition, checked on a schedule"],
    ["Step four: what happens when it fires", "the only output"],
    ["Dry run, then schedule", "watch it count before you trust it"],
  ],
  gateAt: 7,
  steps: [
    {
      id: "why",
      kicker: "Step 0",
      title: "Why this isn't a reminder",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            A reminder goes off at 6am whether you need it or not. After a week you swipe it away without
            reading. My dad never called to say &ldquo;post a reel.&rdquo; He called to ask{" "}
            <strong className="font-bold">how many</strong> &mdash; and the answer was the whole point.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-panel px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">a reminder</div>
              <p className="mt-1 text-[14px] leading-snug">&ldquo;6am: post your reel!&rdquo; Every day. Forever.</p>
            </div>
            <div className="rounded-2xl border-2 border-brand-cocoa bg-panel-2 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">the Sunday call</div>
              <p className="mt-1 text-[14px] leading-snug">
                &ldquo;You&apos;re at 1 of 3 this week.&rdquo; Only on the weeks it&apos;s true.
              </p>
            </div>
          </div>
          <p className="text-[15px] leading-relaxed">
            If you&apos;ve only used AI as a chatbot, or even if you have scheduled agents running (
            <Ref href="https://nextbysophie.com/drop07">part 7</Ref>), this is different: it checks on a
            schedule but it <strong className="font-bold">decides whether to talk</strong>. Before you start:
          </p>
          <Checklist
            id="drop09-ready"
            items={[
              "Claude Code installed (or Claude with scheduled tasks)",
              "Notion connected to my agent",
              "Somewhere it can reach me: Slack, email, or phone notifications",
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Go href="https://code.claude.com/docs/en/quickstart">install claude code</Go>
            <Go href="https://code.claude.com/docs/en/mcp">connect notion + slack</Go>
          </div>
        </div>
      ),
    },
    {
      id: "watch",
      kicker: "Step 1",
      title: "Pick what to watch",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Video count. Workouts. Unpaid invoices. Calendar drift.{" "}
            <strong className="font-bold">One thing, to start.</strong> It has to be something the agent can
            actually count or read &mdash; a Notion database, a calendar, an inbox, a spreadsheet.
          </p>
          <Taps
            steps={[
              <>Pick the number you&apos;d be embarrassed to say out loud on a Sunday.</>,
              <>Make sure it lives somewhere: if you don&apos;t track it yet, a Notion database is the easiest place.</>,
              <>Resist adding a second thing. One rule that works beats five that nag.</>,
            ]}
          />
          <p className="text-[15px] leading-relaxed">Don&apos;t track your posts yet? Have your agent set that up:</p>
          <Copy label="say this in claude code" text={PACE} />
          <Note>
            Mine watches a Notion &ldquo;Content&rdquo; database. Yours could watch Google Calendar for workouts
            or a Stripe/Notion list for invoices &mdash; the rule is the same.
          </Note>
        </div>
      ),
    },
    {
      id: "normal",
      kicker: "Step 2",
      title: "Define what normal looks like",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            10 videos a month. PT Monday / Wednesday / Friday. Replies within 5 days. Whatever your baseline is
            &mdash; <strong className="font-bold">write it as a number the agent can compare against</strong>.
          </p>
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-left text-[13.5px]">
              <thead className="bg-panel text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-3 py-2">watch</th>
                  <th className="px-3 py-2">normal</th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map((e) => (
                  <tr key={e[0]} className="border-t border-line">
                    <td className="px-3 py-2">{e[0]}</td>
                    <td className="px-3 py-2 text-muted">{e[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>
            Be honest, not ambitious. Normal is the pace you&apos;ve actually kept for a month &mdash; the agent
            is there to hold the line, not to move it.
          </Note>
        </div>
      ),
    },
    {
      id: "trigger",
      kicker: "Step 3",
      title: "Set the trigger, not the clock",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Don&apos;t tell it &ldquo;message me at 6am.&rdquo; Tell it the{" "}
            <strong className="font-bold">condition</strong>: behind pace, missed 2+ workouts, invoice 10+ days
            late. It checks on a schedule, but it only talks when the condition is true.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-panel px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">the clock</div>
              <p className="mt-1 text-[14px] leading-snug">&ldquo;Every Sunday at 6pm, message me.&rdquo;</p>
            </div>
            <div className="rounded-2xl border-2 border-brand-cocoa bg-panel-2 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">the trigger</div>
              <p className="mt-1 text-[14px] leading-snug">
                &ldquo;Every Sunday at 6pm, count. <strong className="font-bold">If</strong> fewer than 3,
                message me.&rdquo;
              </p>
            </div>
          </div>
          <Taps
            steps={[
              <>Start the sentence with <strong className="font-bold">If</strong>.</>,
              <>Use a number: fewer than 3, 2 or more missed, 10+ days late.</>,
              <>End with the opposite rule: <strong className="font-bold">otherwise stay silent</strong>.</>,
            ]}
          />
          <Note>
            Get the rules wrong and it&apos;s an annoying nag. Get them right and it feels psychic. The
            &ldquo;otherwise stay silent&rdquo; line is what makes the difference.
          </Note>
        </div>
      ),
    },
    {
      id: "fires",
      kicker: "Step 4",
      title: "Decide what happens when it fires",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            A Slack ping, a push notification, or a drafted action for you to approve. This is the{" "}
            <strong className="font-bold">only output</strong> &mdash; everything else stays silent. Now put all
            four answers together:
          </p>
          <Builder />
          <p className="text-[15px] leading-relaxed">Here&apos;s the exact one I run &mdash; the dad version:</p>
          <Copy label="the Sunday call prompt" text={DAD} />
          <Note>
            For invoices or emails, make the output a <strong className="font-bold text-ink">draft to approve</strong>,
            never an action it takes alone. A message you ignore costs nothing; a chaser it sent to the wrong
            client costs you the client.
          </Note>
        </div>
      ),
    },
    {
      id: "run",
      kicker: "Step 5",
      title: "Dry run, then schedule",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Paste your prompt into Claude Code, then make it show its counting{" "}
            <strong className="font-bold">before</strong> it ever messages you.
          </p>
          <Copy label="paste this after your prompt" text={DRY_RUN} />
          <Checklist
            id="drop09-dryrun"
            items={[
              "It counted the right rows (and only this week's)",
              "The number matches what I know is true",
              "The message sounds like a check-in, not a telling-off",
              "It would stay silent on a week I hit the pace",
            ]}
          />
          <p className="text-[15px] leading-relaxed">Once the count is right, turn it on:</p>
          <Copy label="say this in claude code" text={SCHEDULE} />
          <div className="flex flex-wrap gap-2">
            <Go href="https://code.claude.com/docs/en/scheduled-tasks">scheduling options, compared</Go>
            <Go href="https://code.claude.com/docs/en/routines">cloud routines (laptop can be shut)</Go>
          </div>
          <Note>
            Test the silent side too: temporarily set normal to &ldquo;1 a week&rdquo; and confirm it says
            nothing. An agent that fires every week is just a reminder with extra steps.
          </Note>
        </div>
      ),
    },
    {
      id: "done",
      kicker: "Done",
      title: "Someone's checking",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Next Sunday one of two things happens: nothing, because you did it &mdash; or a short message with a
            number in it. Both are the agent working.
          </p>
          <Checklist
            id="drop09-week"
            items={[
              "The first Sunday check ran (it's in the Intervention log)",
              "It stayed silent on a good week, or messaged on a slow one",
              "I didn't get any other messages from it",
              "After 3 weeks, I'll add a second thing to watch",
            ]}
          />
          <div className="rounded-3xl border border-line bg-panel px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">same four steps, other dads</div>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] leading-snug">
              {EXAMPLES.slice(1).map((e) => (
                <li key={e[0]}>
                  Watch {e[0]} → normal is {e[1]} → if {e[2]} → {e[3]}.
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <Go href="https://nextbysophie.com/newsletter">get the next drop</Go>
            <Go href="https://nextbysophie.com/drop08">part 8: background worker</Go>
          </div>
        </div>
      ),
    },
  ],
};
