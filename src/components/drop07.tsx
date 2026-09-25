"use client";

import { GuideSpec } from "@/components/Guide";
import { Checklist, Copy, Go, Note, Ref, Taps } from "@/components/GuideKit";

const MONDAY =
  "Every Monday at 7am, check my Notion tasks and my Google Calendar for the week ahead, and email me my top 3 priorities. Keep it under 150 words, plain language, no preamble.";

const CRON =
  "Set up a cron job that runs every Monday at 7am, briefs me on the week using my Notion tasks and my calendar, and posts it to Slack. Write the script, set up the cron entry, and show me the schedule before you install it.";

export const DROP07: GuideSpec = {
  slug: "drop07",
  label: "Drop 07 · free",
  freebie: "Drop 07 — Proactive agent",
  headline: (
    <>
      Your agent
      <br />
      stops waiting
      <br />
      on you.
    </>
  ),
  frameTitle: (
    <>
      Make your agent <span className="text-accent">show up on its own.</span>
    </>
  ),
  promise: "15 minutes. It runs on a schedule and messages you before you're awake.",
  goal: (
    <>
      <p>
        Right now your agent does nothing until you open the laptop and talk to it. By the end of this page it
        wakes up on its own, checks your Notion and your calendar, and{" "}
        <span className="text-accent">sends you the brief</span> &mdash; Monday 7am, before you&apos;re up.
      </p>
      <p className="mt-3 text-[14px] font-medium leading-relaxed text-muted">
        Part 7 of AI Agents for Dummies. This one assumes your agent already exists &mdash; if it doesn&apos;t,
        go do parts 1&ndash;6 first.
      </p>
    </>
  ),
  stats: [
    ["15 min", "start to finish"],
    ["0 code", "path 1 is clicks"],
    ["Free", "on your Claude plan"],
  ],
  outline: [
    ["Check what it can reach", "Gmail, Calendar and Notion from episode 3"],
    ["Path 1 — the dummies path", "one prompt, one schedule, inside Claude"],
    ["Write a prompt that works", "the four-part recipe + three to steal"],
    ["Path 2 — Claude Code cron", "for the ones who built it in Claude Code"],
    ["Send it where you'll see it", "email or a Slack ping on your phone"],
    ["Test it before you trust it", "make it fire in 5 minutes, watch it land"],
  ],
  gateAt: 3,
  steps: [
    {
      id: "connections",
      kicker: "Step 1",
      title: "Check what your agent can already reach",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            A scheduled run can only touch what your agent is already connected to. You wired these up in
            episode 3 &mdash; open Claude and confirm they&apos;re still on before you automate anything.
          </p>
          <Go href="https://claude.ai">open claude.ai</Go>
          <Checklist
            id="drop07-connections"
            items={[
              "Gmail is connected",
              "Google Calendar is connected",
              "Notion is connected",
              "I'm on a paid Claude plan (Pro, Max, Team or Enterprise)",
            ]}
          />
          <Note>
            Missing one? Reconnect it in Claude&apos;s settings under connectors, then come back. Scheduling
            something your agent can&apos;t reach is the #1 reason these run and return nothing.
          </Note>
        </div>
      ),
    },
    {
      id: "path-one",
      kicker: "Step 2",
      title: "Path 1 — the dummies path",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            No terminal, no code. You describe the job like you&apos;re talking to it, pick a time, and save.
          </p>
          <Taps
            steps={[
              <>
                Open <Ref href="https://claude.ai">claude.ai</Ref>.
              </>,
              <>Click your profile, then Automations.</>,
              <>Click New automation.</>,
              <>Paste the prompt below.</>,
              <>Pick the time and the days.</>,
              <>Save. That&apos;s it.</>,
            ]}
          />
          <Copy label="paste this as your automation" text={MONDAY} />
          <Note>
            Don&apos;t see &ldquo;Automations&rdquo;? Claude keeps renaming it. Look for{" "}
            <strong className="font-bold text-ink">Scheduled</strong> in the left sidebar, or type{" "}
            <strong className="font-bold text-ink">/schedule</strong> inside any task and it&apos;ll set the
            whole thing up with you.{" "}
            <Ref href="https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork">
              Anthropic&apos;s walkthrough
            </Ref>
            .
          </Note>
          <Note>
            These runs happen in Anthropic&apos;s cloud &mdash; your laptop can be shut. That&apos;s the whole
            point: it works while you sleep.
          </Note>
        </div>
      ),
    },
    {
      id: "prompt",
      kicker: "Step 3",
      title: "Write a prompt that actually works",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            A scheduled prompt runs with nobody in the room, so it has to say everything up front. Four parts,
            in this order:
          </p>
          <Taps
            steps={[
              <>
                <strong className="font-bold">When</strong> &mdash; &ldquo;every Monday at 7am&rdquo;
              </>,
              <>
                <strong className="font-bold">Where to look</strong> &mdash; &ldquo;my Notion tasks and my
                calendar&rdquo;
              </>,
              <>
                <strong className="font-bold">What to decide</strong> &mdash; &ldquo;pick my top 3
                priorities&rdquo;
              </>,
              <>
                <strong className="font-bold">Where to put it</strong> &mdash; &ldquo;email it to me, under
                150 words&rdquo;
              </>,
            ]}
          />
          <p className="text-[15px] font-semibold leading-relaxed">Three you can steal:</p>
          <Copy
            label="monday brief"
            text="Every Monday at 7am, look at my Notion tasks and my calendar for the week, and email me my top 3 priorities plus anything with a deadline before Friday. Under 150 words."
          />
          <Copy
            label="nightly inbox triage"
            text="Every weekday at 8pm, scan today's unread Gmail, list anything that actually needs a reply from me with a one-line summary each, and email it to me. Ignore newsletters and receipts."
          />
          <Copy
            label="friday loose ends"
            text="Every Friday at 4pm, check my Notion tasks for anything marked in progress that hasn't moved this week, and email me the list with a suggested next step for each one."
          />
          <Note>
            Rule of thumb: if a stranger couldn&apos;t follow your prompt without asking you a question, your
            agent can&apos;t either.
          </Note>
        </div>
      ),
    },
    {
      id: "path-two",
      kicker: "Step 4",
      title: "Path 2 — the Claude Code path",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Built your agent in Claude Code? Then you don&apos;t click anything &mdash; you just ask it to
            schedule itself. It writes the script, sets up the cron entry, and asks you to approve.
          </p>
          <Copy label="say this in claude code" text={CRON} />
          <Taps
            steps={[
              <>Open Claude Code in your agent&apos;s folder and paste that in.</>,
              <>Read what it proposes, then approve it.</>,
              <>
                Check it landed: run <strong className="font-bold">crontab -l</strong> and you should see your
                job.
              </>,
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Go href="https://code.claude.com/docs/en/quickstart">install claude code</Go>
            <Go href="https://crontab.guru/">decode a cron time</Go>
          </div>
          <Note>
            Cron only fires while your machine is awake. If you want it running with the laptop shut, use{" "}
            <Ref href="https://code.claude.com/docs/en/routines">routines</Ref> (Anthropic&apos;s cloud
            version) instead &mdash; same prompt, no machine.{" "}
            <Ref href="https://code.claude.com/docs/en/scheduled-tasks">The scheduling options, compared</Ref>
            .
          </Note>
        </div>
      ),
    },
    {
      id: "output",
      kicker: "Step 5",
      title: "Send it where you'll actually see it",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            An automation you have to go looking for isn&apos;t an automation. Pick the place you already look
            at without thinking.
          </p>
          <Checklist
            id="drop07-output"
            items={[
              "Email — zero setup, it's just in your inbox at 7am",
              "Slack — buzzes your phone, best if you want it to feel like a person messaged you",
              "Notion — good for logs you want to keep, bad for anything urgent",
            ]}
          />
          <Copy
            label="add slack to any automation"
            text="Post the result to my Slack instead of emailing it. Send it to #daily as a single message, no attachments."
          />
          <Note>
            For the Claude Code path, Slack is one incoming webhook URL your script posts to &mdash;{" "}
            <Ref href="https://api.slack.com/messaging/webhooks">Slack&apos;s 4-step setup</Ref>. Keep that URL
            private; it&apos;s a password.
          </Note>
          <Note>
            Turn on notifications for that channel on your phone and the brief lands as a buzz. That&apos;s the
            moment it stops being a chatbot.
          </Note>
        </div>
      ),
    },
    {
      id: "test",
      kicker: "Step 6",
      title: "Test it before you trust it",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Never leave a new automation to prove itself next Monday. Make it fire now, watch what it sends,
            then put it back.
          </p>
          <Taps
            steps={[
              <>Edit the schedule to 5 minutes from now (or hit Run now if your version has it).</>,
              <>Wait for it to land. Read what it actually sent you.</>,
              <>
                Too long? Wrong stuff? Edit the prompt, not the schedule &mdash; add the missing instruction in
                plain words.
              </>,
              <>Set the real time and day. Done.</>,
            ]}
          />
          <Checklist
            id="drop07-test"
            items={[
              "It ran without me opening anything",
              "It pulled real data from my Notion/calendar",
              "It arrived where I actually look",
              "It's short enough that I read all of it",
              "The real schedule is set",
            ]}
          />
        </div>
      ),
    },
    {
      id: "done",
      kicker: "You're done",
      title: "It's typing to you now",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Your agent just stopped waiting on you. It wakes up, looks around your life, and reports in &mdash;
            before you&apos;re awake. That&apos;s the whole difference between reactive and proactive, and
            it&apos;s the first honest version of &ldquo;AI running your business.&rdquo;
          </p>
          <div className="rounded-3xl border border-line bg-panel px-5 py-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
              schedule these next
            </div>
            <ul className="mt-3 space-y-2 text-[14.5px] leading-snug">
              <li>Sunday 6pm — next week&apos;s calendar, flag anything you haven&apos;t prepped for.</li>
              <li>Daily 9am — anyone waiting on a reply from you for more than 2 days.</li>
              <li>1st of the month — unpaid invoices and what to chase.</li>
            </ul>
          </div>
          <Copy
            label="one more to paste in"
            text="Every Sunday at 6pm, look at my calendar for the coming week and email me anything I haven't prepared for yet, with one line on what I'd need to do to be ready."
          />
          <div className="flex flex-wrap gap-2">
            <Go href="https://nextbysophie.com/newsletter">get the next drop</Go>
            <Go href="https://nextbysophie.com/free-products">the rest of my stuff</Go>
          </div>
        </div>
      ),
    },
  ],
};
