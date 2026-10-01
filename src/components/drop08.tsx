"use client";

import { useState } from "react";
import { GuideSpec } from "@/components/Guide";
import { Checklist, Copy, Go, Note, Ref, Taps } from "@/components/GuideKit";

const PITCH =
  'Every weekday at 6am, check my Dream Brands Notion database for anyone marked "Not Pitched." Find their marketing lead via web search. Draft a pitch email using my media kit. Save each as a Gmail draft — do not send. Update the Notion row to "Draft Ready."';

const DATABASE =
  'Create a Notion database called "Dream Brands" with these columns: Brand (title), Website (URL), Status (select: Not Pitched, Draft Ready, Pitched, Replied), Marketing Lead (text), Lead Email (email), Notes (text). Add three example brands marked "Not Pitched" so I can test with them.';

const MANUAL =
  'Run this once, right now, on just ONE brand marked "Not Pitched" so I can check the output. Show me who you found as the marketing lead and where you found them, then show me the draft before you save it. Do not send anything.';

const SKILL =
  'That output is good. Turn exactly what you just did into a skill called pitch-drafts, saved in this folder. Include every step, where my media kit lives, and these rules: never send an email, only save Gmail drafts, only touch rows marked "Not Pitched", and set each row to "Draft Ready" when its draft is saved. If you can\'t find a marketing lead, skip that brand and leave a note in its row.';

const CRON =
  "Set up a cron job on this computer that runs my pitch-drafts skill every weekday at 6am, using Claude Code in headless mode (claude -p) from this folder. Give it only the permissions it needs (Notion, Gmail drafts, web search) and write every run to a log file. Show me the crontab line and the exact command before you install it, then run the command once so I can watch it work.";

/** The three questions, answered on the page, come back as one paragraph —
 *  the whole point of the drop is that the prompt is the build. */
function Builder() {
  const [when, setWhen] = useState("Every weekday at 6am");
  const [reads, setReads] = useState("");
  const [does, setDoes] = useState("");
  const [saves, setSaves] = useState("");
  const ready = reads.trim() && does.trim() && saves.trim();
  const prompt = ready
    ? `${when.trim() || "Every weekday at 6am"}, ${reads.trim()}. ${does.trim()}. ${saves.trim()} — do not send or publish anything.`
    : "";
  const field =
    "w-full rounded-xl border border-line bg-white/70 px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted/70 focus:border-accent";
  return (
    <div className="space-y-3 rounded-3xl border border-line bg-panel p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
        answer them here, get your prompt
      </div>
      <label className="block text-[13px] font-semibold">
        When does it run?
        <input className={`${field} mt-1`} value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <label className="block text-[13px] font-semibold">
        1. What does it read?
        <input
          className={`${field} mt-1`}
          value={reads}
          onChange={(e) => setReads(e.target.value)}
          placeholder='check my Notion to-dos marked "Today"'
        />
      </label>
      <label className="block text-[13px] font-semibold">
        2. What does it do with that?
        <input
          className={`${field} mt-1`}
          value={does}
          onChange={(e) => setDoes(e.target.value)}
          placeholder="Group them by project and pick the one that matters most"
        />
      </label>
      <label className="block text-[13px] font-semibold">
        3. Where does it save the result?
        <input
          className={`${field} mt-1`}
          value={saves}
          onChange={(e) => setSaves(e.target.value)}
          placeholder="Save it as a new Notion page called Today's Plan"
        />
      </label>
      {ready ? (
        <Copy label="your background worker, in one paragraph" text={prompt} />
      ) : (
        <p className="text-[12.5px] text-muted">Fill in all three and your prompt shows up here.</p>
      )}
    </div>
  );
}

export const DROP08: GuideSpec = {
  slug: "drop08",
  label: "Drop 08",
  freebie: "Drop 08 — Background worker",
  open: true,
  headline: (
    <>
      Wake up to
      <br />
      work you
      <br />
      didn&apos;t do.
    </>
  ),
  frameTitle: (
    <>
      Set AI to <span className="text-accent">work in the background.</span>
    </>
  ),
  promise: "20 minutes. Three questions, one paragraph, and a job that runs while you sleep.",
  goal: (
    <>
      <p>
        By the end of this page your agent runs every weekday at 6am on its own: it finds brands you haven&apos;t
        pitched, looks up who to email, and leaves{" "}
        <span className="text-accent">pitch drafts waiting in your Gmail</span> &mdash; with your Notion updated
        to match.
      </p>
      <p className="mt-3 text-[14px] font-medium leading-relaxed text-muted">
        Part 8 of AI Agents for Dummies. You&apos;ll need the folder AI agent in Claude Code from the earlier
        parts, with Notion and Gmail connected. The whole guide is open &mdash; no email needed.
      </p>
    </>
  ),
  stats: [
    ["20 min", "start to finish"],
    ["3", "questions to answer"],
    ["0", "emails sent without you"],
  ],
  outline: [
    ["What a background worker is", "and what it isn't"],
    ["The three questions", "answer them, get your prompt"],
    ["Write it as one prompt", "the pitch-drafts example, ready to copy"],
    ["Run it by hand first", "the part everyone skips"],
    ["Turn it into a skill", "so it does it the same way every time"],
    ["Put it on a schedule", "one cron job, weekdays at 6am"],
  ],
  gateAt: 7,
  steps: [
    {
      id: "what",
      kicker: "Step 1",
      title: "What a background worker actually is",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            A task that runs <strong className="font-bold">without you triggering it</strong>, and produces
            something you can actually <em>use</em> &mdash; not just a message.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-panel px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">a reminder</div>
              <p className="mt-1 text-[14px] leading-snug">&ldquo;You have 4 brands you haven&apos;t pitched.&rdquo;</p>
            </div>
            <div className="rounded-2xl border-2 border-brand-cocoa bg-panel-2 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">a background worker</div>
              <p className="mt-1 text-[14px] leading-snug">
                4 pitch emails, written, sitting in your drafts. Notion already updated.
              </p>
            </div>
          </div>
          <p className="text-[15px] leading-relaxed">Before you start, make sure you have:</p>
          <Checklist
            id="drop08-ready"
            items={[
              "Claude Code installed, with my folder AI agent in it",
              "Notion connected to my agent",
              "Gmail connected to my agent",
              "My media kit saved somewhere my agent can read (a file in the folder or a Notion page)",
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Go href="https://code.claude.com/docs/en/quickstart">install claude code</Go>
            <Go href="https://code.claude.com/docs/en/mcp">connect notion + gmail</Go>
          </div>
        </div>
      ),
    },
    {
      id: "questions",
      kicker: "Step 2",
      title: "Answer three questions before you build anything",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Every background worker is the same three answers. Get these straight and the prompt writes itself.
          </p>
          <Taps
            steps={[
              <>
                <strong className="font-bold">What does it read?</strong> Your Notion? Your Gmail? A web page?
                Your calendar?
              </>,
              <>
                <strong className="font-bold">What does it do with that?</strong> Draft something? Categorize it?
                Update a status?
              </>,
              <>
                <strong className="font-bold">Where does it save the result?</strong> Gmail drafts? A new Notion
                page? A file on your desktop?
              </>,
            ]}
          />
          <Builder />
          <Note>
            Always have it <strong className="font-bold text-ink">save</strong>, never send or publish. A draft
            you delete costs nothing; an email you didn&apos;t mean to send costs a brand.
          </Note>
        </div>
      ),
    },
    {
      id: "prompt",
      kicker: "Step 3",
      title: "Write it as one prompt",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Here&apos;s exactly the one I run. Read: a Notion database. Do: find a contact, draft a pitch. Save:
            Gmail drafts + a status update. Three questions, one paragraph.
          </p>
          <Copy label="the pitch-drafts prompt" text={PITCH} />
          <p className="text-[15px] leading-relaxed">
            No Dream Brands database yet? Open your folder agent in Claude Code and have it build one for you:
          </p>
          <Copy label="say this in claude code" text={DATABASE} />
          <Checklist
            id="drop08-database"
            items={[
              "Dream Brands database exists in Notion",
              'At least one brand is marked "Not Pitched"',
              "My agent knows where my media kit is",
            ]}
          />
          <Note>
            The status names in your prompt have to match your Notion options exactly &mdash; &ldquo;Not
            Pitched&rdquo; and &ldquo;Draft Ready&rdquo;, same spelling, same capitals.{" "}
            <Ref href="https://www.notion.so/help/intro-to-databases">Notion databases, explained</Ref>.
          </Note>
        </div>
      ),
    },
    {
      id: "manual",
      kicker: "Step 4",
      title: "Run it by hand first",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            This is the part everyone skips. Paste the prompt into Claude Code and{" "}
            <strong className="font-bold">watch it work</strong>. Do NOT schedule a bad prompt &mdash; a bad
            prompt on a schedule just makes bad drafts every morning.
          </p>
          <Copy label="paste this after your prompt" text={MANUAL} />
          <p className="text-[15px] leading-relaxed">Then check the draft like a brand would read it:</p>
          <Checklist
            id="drop08-review"
            items={[
              "It found a real person, not a generic info@ address",
              "The pitch sounds like me, not like a robot",
              "It used real numbers from my media kit",
              "It saved a draft and did NOT send",
              'The Notion row flipped to "Draft Ready"',
            ]}
          />
          <Note>
            Something off? Just tell it: &ldquo;shorter&rdquo;, &ldquo;mention my last brand deal&rdquo;,
            &ldquo;less formal&rdquo;. Run it again on the next brand. Keep going until you&apos;d send the draft
            as-is.
          </Note>
        </div>
      ),
    },
    {
      id: "skill",
      kicker: "Step 5",
      title: "Turn it into a skill",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            A skill is your good prompt, saved with its rules, so it does it the same way every time &mdash;
            including every tweak you just made.
          </p>
          <Copy label="say this in claude code" text={SKILL} />
          <Taps
            steps={[
              <>Paste that in once the output is good.</>,
              <>Read the skill it writes and approve it.</>,
              <>
                Test it: type <strong className="font-bold">/pitch-drafts</strong> and it should do the whole job
                on its own.
              </>,
            ]}
          />
          <Go href="https://code.claude.com/docs/en/skills">how skills work</Go>
        </div>
      ),
    },
    {
      id: "schedule",
      kicker: "Step 6",
      title: "Put it on a schedule",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Now tell Claude to run the skill for you. It writes the command, sets up the cron job, and shows you
            before installing.
          </p>
          <Copy label="say this in claude code" text={CRON} />
          <Taps
            steps={[
              <>Read the crontab line it shows you. Weekdays at 6am looks like <strong className="font-bold">0 6 * * 1-5</strong>.</>,
              <>Approve it and let it run once.</>,
              <>
                Check it landed: run <strong className="font-bold">crontab -l</strong> and your job is there.
              </>,
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Go href="https://crontab.guru/#0_6_*_*_1-5">decode the cron time</Go>
            <Go href="https://code.claude.com/docs/en/headless">claude -p, explained</Go>
          </div>
          <Note>
            Cron only fires while your computer is awake. Laptop closed at 6am? Use{" "}
            <Ref href="https://code.claude.com/docs/en/desktop-scheduled-tasks">Desktop scheduled tasks</Ref> or
            a cloud <Ref href="https://code.claude.com/docs/en/routines">routine</Ref> instead &mdash; same skill,
            and routines run with the laptop shut.{" "}
            <Ref href="https://code.claude.com/docs/en/scheduled-tasks">All the options, compared</Ref>.
          </Note>
        </div>
      ),
    },
    {
      id: "done",
      kicker: "Done",
      title: "Work that started without you",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Tomorrow morning: Gmail drafts you didn&apos;t write. A Notion column that updated itself. Check it
            the first few mornings before you trust it.
          </p>
          <Checklist
            id="drop08-morning"
            items={[
              "Drafts showed up in Gmail",
              'Rows moved from "Not Pitched" to "Draft Ready"',
              "The log file shows the run finished",
              "I read and sent (or fixed) the drafts myself",
            ]}
          />
          <div className="rounded-3xl border border-line bg-panel px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
              same three questions, other jobs
            </div>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] leading-snug">
              <li>Read new Gmail → sort into Notion leads → save a reply draft for each.</li>
              <li>Read tomorrow&apos;s calendar → pull notes on who you&apos;re meeting → save a prep page.</li>
              <li>Read a competitor&apos;s blog → summarize what&apos;s new → save a file on your desktop.</li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <Go href="https://nextbysophie.com/newsletter">get the next drop</Go>
            <Go href="https://nextbysophie.com/drop07">part 7: make it proactive</Go>
          </div>
        </div>
      ),
    },
  ],
};
