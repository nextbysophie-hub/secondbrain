"use client";

import { useEffect, useState } from "react";
import { GuideSpec } from "@/components/Guide";
import { Checklist, Copy, Go, Note, Ref, Taps } from "@/components/GuideKit";

const FACE =
  "Make one realistic photo of a person, the kind a friend took on a phone. Not a studio portrait, not an illustration, not a logo.\n\nWho they are: [one sentence about one fake customer]\nWhere they are: [the place the ad is about]\n\nOne person. Normal clothes. Normal light. No text. No watermark. Don't make them look like a model.";

const FACE_EXAMPLE =
  "Make one realistic photo of a person, the kind a friend took on a phone. Not a studio portrait, not an illustration, not a logo.\n\nWho they are: a dog owner in Austin with a high-energy dog, and a backyard the dog has clearly won\nWhere they are: that backyard, the dog nearby, an ordinary afternoon\n\nOne person. Normal clothes. Normal light. No text. No watermark. Don't make them look like a model.";

const TEMPLATE = `Call-out (the only line that changes):
[the first line. it tells the right person "this is for you." paste one.]

Hook (stays):
[one sentence that stays on the picture the call-out just made. don't start a new idea.]

Problem (stays):
[the specific annoying thing they live with, said the way they would say it. two short sentences.]

Offer (stays):
[what you're doing, who it's for, and what it costs them. if you don't have a number, leave it out.]

CTA (stays):
[one ask. say it once.]`;

const FILL = `Fill my video ad script for one fake customer. Write it like a person talking to one person, not like an ad.

Fake customer: [who they are]
City or niche: [city or niche]
Offer: [what I'm actually doing for them]
Call-out, use this exact line and don't rewrite it: [paste one call-out]

Output exactly this, and nothing else:

Call-out (the only line that changes):
[my line, word for word]

Hook (stays):
[one sentence that stays on the picture the call-out just made. no new idea.]

Problem (stays):
[the specific annoying thing they live with, the way they would say it. two short sentences.]

Offer (stays):
[what I'm doing, who it's for, and what it costs them. only facts I gave you. if I didn't give a price, don't invent one.]

CTA (stays):
[one ask. say it once.]

Rules: the hook, problem, offer, and CTA have to still make sense if I delete the call-out and paste in a different one. Keep it short enough to say out loud without rushing. No hashtags. No "hey guys." No made-up numbers, reviews, or results.`;

/** Sophie's three doors for the hyper dog owner, from the video. The "three
 *  dog owners" and "no profit" are her offer, not a rule for everyone. */
const HYPER = {
  avatar: "dog owners with a high-energy dog",
  place: "Austin",
  offer: "a full yard redesign",
};

const HYPER_LINES = [
  "If you have a high-energy dog in Austin, your backyard probably looks like this.",
  "I'm giving three dog owners a full yard redesign, and making no profit from it.",
  "Austin dog owners, I want to turn your yard from this… to this.",
];

const HYPER_CALLOUTS = HYPER_LINES.map((line, i) => `${i + 1}. ${line}`).join("\n");

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cap(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function doors(avatar: string, place: string, offer: string, sample: boolean) {
  if (sample) return HYPER_LINES;
  return [
    `If you're one of the ${avatar} in ${place}, this is for you.`,
    `I'm doing ${offer} for ${avatar} in ${place}.`,
    `${cap(avatar)} in ${place}, I want to take you from this… to ${offer}.`,
  ];
}

const DRAFT_KEY = "nbs-drop10-doors";

type Draft = { avatar: string; place: string; offer: string; sample: boolean };

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.avatar !== "string") return null;
    return {
      avatar: parsed.avatar,
      place: typeof parsed.place === "string" ? parsed.place : "",
      offer: typeof parsed.offer === "string" ? parsed.offer : "",
      sample: Boolean(parsed.sample),
    };
  } catch {
    return null;
  }
}

function morePrompt(avatar: string, place: string, offer: string, lines: string[]) {
  const have = lines.map((line, i) => `${i + 1}. ${line}`).join("\n");
  return `Write more call-outs for one fake customer. A call-out is the first line of a video ad, the line that tells them "this is for you."

Who they are: ${avatar}
City or niche: ${place}
Offer: ${offer}

I already have these. Don't repeat them:
${have}

Give me 5 more. Same person, same offer, every time. Change the door in, not the deal. Mix these kinds:
- a line that describes their life so specifically they feel seen
- a line that leads with the offer, in the real terms
- a line that names who they are and says "from this… to this"

Plain spoken words. No slogans. Don't write the rest of the ad. Don't invent prices, reviews, or results. Number them.`;
}

const PARTS: { name: string; moves: boolean; text: string }[] = [
  { name: "Call-out", moves: true, text: HYPER_LINES[0] },
  {
    name: "Hook",
    moves: false,
    text: "[one sentence that stays on the picture the call-out just made]",
  },
  {
    name: "Problem",
    moves: false,
    text: "[the annoying thing they live with, in their words. two short sentences.]",
  },
  {
    name: "Offer",
    moves: false,
    text: "[what you're doing, who it's for, and what it costs them]",
  },
  { name: "CTA", moves: false, text: "[one ask. say it once.]" },
];

/** Avatar, place, and offer in — three call-out lines and a prompt for more. */
function Builder() {
  const [seed] = useState(readDraft);
  const [avatar, setAvatar] = useState(seed?.avatar ?? "");
  const [place, setPlace] = useState(seed?.place ?? "");
  const [offer, setOffer] = useState(seed?.offer ?? "");
  const [sample, setSample] = useState(seed?.sample ?? false);
  useEffect(() => {
    try {
      const draft: Draft = { avatar, place, offer, sample };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode */
    }
  }, [avatar, place, offer, sample]);
  const who = clean(avatar);
  const where = clean(place);
  const what = clean(offer);
  const ready = Boolean(who && where && what);
  const lines = ready ? doors(who, where, what, sample) : [];
  const field =
    "w-full rounded-xl border border-line bg-white/70 px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted/70 focus:border-accent";
  return (
    <div className="space-y-3 rounded-3xl border border-line bg-panel p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
        three answers, three doors
      </div>
      <button
        type="button"
        onClick={() => {
          setAvatar(HYPER.avatar);
          setPlace(HYPER.place);
          setOffer(HYPER.offer);
          setSample(true);
        }}
        className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted transition hover:border-accent hover:text-ink"
      >
        my hyper dog owner
      </button>
      <label className="block text-[13px] font-semibold">
        Who are they?
        <input
          className={`${field} mt-1`}
          value={avatar}
          onChange={(e) => {
            setAvatar(e.target.value);
            setSample(false);
          }}
          placeholder="dog owners with a high-energy dog"
          autoComplete="off"
        />
      </label>
      <label className="block text-[13px] font-semibold">
        City or niche
        <input
          className={`${field} mt-1`}
          value={place}
          onChange={(e) => {
            setPlace(e.target.value);
            setSample(false);
          }}
          placeholder="Austin"
          autoComplete="off"
        />
      </label>
      <label className="block text-[13px] font-semibold">
        The offer, in real terms
        <input
          className={`${field} mt-1`}
          value={offer}
          onChange={(e) => {
            setOffer(e.target.value);
            setSample(false);
          }}
          placeholder="a full yard redesign"
          autoComplete="off"
        />
      </label>
      {ready ? (
        <>
          <p className="text-[12.5px] leading-relaxed text-muted">
            {sample
              ? "These are the three I’m actually testing on my hyper dog owner. Same person, three doors."
              : "A first pass from what you typed. Same person, three doors. Ask for more, then pick four."}
          </p>
          <ol className="space-y-2">
            {lines.map((line, i) => (
              <li key={line} className="flex gap-3 rounded-2xl border border-line bg-panel-2 px-3.5 py-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-cocoa text-[12px] font-bold text-brand-cream">
                  {i + 1}
                </span>
                <span className="min-w-0 break-words text-[14.5px] leading-snug">{line}</span>
              </li>
            ))}
          </ol>
          <Copy label="your three call-outs" text={lines.map((line, i) => `${i + 1}. ${line}`).join("\n")} />
          <Copy label="ask chatgpt for more doors" text={morePrompt(who, where, what, lines)} />
        </>
      ) : (
        <p className="text-[12.5px] text-muted">Fill in all three and your call-outs show up here.</p>
      )}
    </div>
  );
}

export const DROP10: GuideSpec = {
  slug: "drop10",
  label: "Drop 10",
  freebie: "Drop 10 — Ads for Dummies",
  open: true,
  headline: (
    <>
      Write the ad
      <br />
      to a face.
    </>
  ),
  frameTitle: (
    <>
      Write it to a <span className="text-accent">face</span>.
    </>
  ),
  promise: "Two fake customers. Four ads each. One body, and the only line you change is the first.",
  goal: (
    <>
      <p>
        I&apos;m Sophie, this is Ads for Dummies, and this is the script template from the video. I&apos;m not an
        ads expert. I&apos;m a girl learning by doing. These fake customers already got me my first real clients
        with static ads, so now we&apos;re writing the video ones.
      </p>
      <p className="mt-3 text-[14px] font-medium leading-relaxed text-muted">
        You&apos;ll leave with two faces, a call-out that changes, and a body that doesn&apos;t. Commented
        SCRIPT? This is the DM. The whole guide is open &mdash; no email needed. Do it on your laptop, pictures
        up next to the page.
      </p>
    </>
  ),
  stats: [
    ["2", "faces, not five"],
    ["4", "ads each"],
    ["1", "line that changes"],
  ],
  outline: [
    ["Pick two fake customers", "not all five"],
    ["Give each one a face", "a picture, not a pile of notes"],
    ["Decide three things", "the count, the test, the call-out"],
    ["Write three doors in", "same person, different first line"],
    ["Fill the script template", "call-out, hook, problem, offer, CTA"],
    ["Read the round", "only the first line was allowed to move"],
  ],
  gateAt: 6,
  steps: [
    {
      id: "pick",
      kicker: "Step 1",
      title: "Pick two fake customers",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            I make five fake customers with AI. I don&apos;t use all five. I pick two. If I can&apos;t tell them
            apart, I can&apos;t write an ad to them.
          </p>
          <Note>
            Make the fake customers in the earlier video before you pick. That link is not in yet, on purpose:{" "}
            <strong className="font-mono text-accent">TODO: fake-customers video URL</strong>
          </Note>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-panel px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">face one</div>
              <p className="mt-1 text-[15px] font-bold leading-snug">the hyper dog owner</p>
            </div>
            <div className="rounded-2xl border border-line bg-brand-periwinkle/25 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">face two</div>
              <p className="mt-1 text-[15px] font-bold leading-snug">the dog maximalist</p>
            </div>
          </div>
          <p className="text-[15px] leading-relaxed">
            Those two are mine. Yours are whoever you could describe to a friend without looking anything up.
          </p>
          <Taps
            steps={[
              <>If you don&apos;t have fake customers yet, do that earlier video first.</>,
              <>Pick the two you can tell apart with your eyes closed.</>,
              <>Stop at two. Five people is a crowd, and a crowd is how the writing gets vague.</>,
            ]}
          />
          <Checklist
            id="drop10-pick"
            items={[
              "I have fake customers already, or I'll make them before I write",
              "I picked two, and I can say how they're different",
              "The other ones are sitting this round out",
            ]}
          />
        </div>
      ),
    },
    {
      id: "face",
      kicker: "Step 2",
      title: "Give each one a face",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            I don&apos;t write to a pile of notes. I have <Ref href="https://chatgpt.com/">ChatGPT</Ref> make a
            picture of each person, and I write to the face. A face is harder to lie to.
          </p>
          <Copy label="the picture prompt — fill the blanks" text={FACE} />
          <Copy label="example fill, for my hyper dog owner" text={FACE_EXAMPLE} />
          <Taps
            steps={[
              <>Open ChatGPT and paste the prompt with your first person filled in.</>,
              <>Run it again for the second person. Don&apos;t reuse the first face.</>,
              <>If it comes back glossy, tell it &ldquo;more like a phone photo, worse camera.&rdquo;</>,
              <>Keep both pictures up for the rest of this page.</>,
            ]}
          />
          <Go href="https://chatgpt.com/">open chatgpt</Go>
          <Note>
            You&apos;re about to write an ad to someone. If you catch yourself writing to &ldquo;people who like
            dogs,&rdquo; look at the picture again.
          </Note>
        </div>
      ),
    },
    {
      id: "decide",
      kicker: "Step 3",
      title: "Decide three things first",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Before I write a single word, I decide three things. How many ads. What I&apos;m testing. And the
            call-out &mdash; the first line, where you tell someone &ldquo;this is for you.&rdquo;
          </p>
          <Taps
            steps={[
              <>
                <strong className="font-bold">How many:</strong> two avatars, four ads each.
              </>,
              <>
                <strong className="font-bold">What this round tests:</strong> the call-out. Nothing else.
              </>,
              <>
                <strong className="font-bold">What I want to know after:</strong> what each fake customer likes
                to be called.
              </>,
            ]}
          />
          <Checklist
            id="drop10-decide"
            items={[
              "How many ads: two avatars, four ads each",
              "What I'm testing: the call-out, the first line that says this is for you",
              "What I want to know after: what each fake customer likes to be called",
            ]}
          />
          <p className="text-[15px] leading-relaxed">
            Here are three of the doors I&apos;m testing on my hyper dog owner. Same person. Three completely
            different ways in.
          </p>
          <ol className="space-y-2">
            {HYPER_LINES.map((line, i) => (
              <li key={line} className="flex gap-3 rounded-2xl border border-line bg-panel px-3.5 py-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-cocoa text-[12px] font-bold text-brand-cream">
                  {i + 1}
                </span>
                <span className="min-w-0 break-words text-[14.5px] leading-snug">&ldquo;{line}&rdquo;</span>
              </li>
            ))}
          </ol>
          <Copy label="my three call-outs, hyper dog owner" text={HYPER_CALLOUTS} />
          <Note>
            The middle line leads with the offer, including the part where I don&apos;t make a profit. Don&apos;t
            borrow that unless it&apos;s true for you. Same kind of door, your real terms. The next video is me
            talking to an AI brain of each avatar about what they want to be called. You can write today without
            it.
          </Note>
        </div>
      ),
    },
    {
      id: "doors",
      kicker: "Step 4",
      title: "Three doors, same person",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            The body can wait. First I want the doors. Type who they are, the city or niche, and the offer.
            You get three call-outs, plus a prompt that asks for more. The round is four ads, so pick a fourth
            from those. Don&apos;t get it by rewriting the offer.
          </p>
          <Builder />
          <Go href="https://chatgpt.com/">ask chatgpt for more</Go>
          <Note>
            If a line sounds stiff, that&apos;s fine. Keep the ones you&apos;d actually say out loud to that
            face. A clever line they wouldn&apos;t answer to is the wrong door.
          </Note>
        </div>
      ),
    },
    {
      id: "script",
      kicker: "Step 5",
      title: "The script template",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Then I write. The call-out is a slot. Under it, the body stays almost identical in every ad: hook,
            problem, offer, CTA. Only the first line changes. If I changed everything, I&apos;d have no idea
            what actually worked.
          </p>
          <p className="text-[13.5px] leading-relaxed text-muted">
            The yellow line is one of my real call-outs. The four under it are the body you write once.
          </p>
          <div className="space-y-2">
            {PARTS.map((part) => (
              <div
                key={part.name}
                className={`rounded-2xl border border-line px-4 py-3 ${
                  part.moves ? "bg-[#ffe6a3]" : "bg-panel"
                }`}
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
                  {part.moves ? "changes every ad" : "stays"} · {part.name}
                </div>
                <p className="mt-1 break-words text-[14.5px] leading-snug">{part.text}</p>
              </div>
            ))}
          </div>
          <Taps
            steps={[
              <>Paste one call-out into the top slot.</>,
              <>Write the hook, the problem, the offer, and the CTA once.</>,
              <>Read it out loud to the picture. If you wouldn&apos;t say it to that face, fix the body now.</>,
              <>Duplicate the ad for the other call-outs and only change the first line.</>,
            ]}
          />
          <Copy label="the script template" text={TEMPLATE} />
          <Copy label="prompt that fills the template for one avatar" text={FILL} />
          <Go href="https://chatgpt.com/">open chatgpt</Go>
          <Note>
            Let it fill the body for one avatar. You do the swapping yourself, so it doesn&apos;t &ldquo;help&rdquo;
            by writing four different ads.
          </Note>
        </div>
      ),
    },
    {
      id: "read",
      kicker: "Step 6",
      title: "Only the call-out changes",
      Body: () => (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed">
            Two avatars, four ads each. The body stays. The call-out is the only thing that moves. When the
            round is done, you want one answer per face: what do they like to be called?
          </p>
          <div className="rounded-2xl border border-line bg-[#ffe6a3] px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">the only question</div>
            <p className="mt-1 text-[16px] font-bold leading-snug">What does this person like to be called?</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["the hyper dog owner", "four call-outs, one body"],
              ["the dog maximalist", "four different call-outs, one body"],
            ].map(([name, detail]) => (
              <div key={name} className="rounded-2xl border border-line bg-panel px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">one face</div>
                <p className="mt-1 text-[15px] font-bold leading-snug">{name}</p>
                <p className="mt-1 text-[13.5px] leading-snug text-muted">{detail}</p>
              </div>
            ))}
          </div>
          <p className="text-[15px] leading-relaxed">
            That&apos;s my round. Yours is the same shape with your two faces. Here&apos;s what &ldquo;only the
            call-out changes&rdquo; looks like on the hyper dog owner &mdash; three of the four doors, and the
            body under them doesn&apos;t move:
          </p>
          <ol className="space-y-2">
            {HYPER_LINES.map((line, i) => (
              <li key={line} className="rounded-2xl border border-line bg-panel px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
                  ad {i + 1} · call-out
                </div>
                <p className="mt-1 break-words text-[14.5px] leading-snug">{line}</p>
                <p className="mt-1 text-[13px] leading-snug text-muted">
                  Hook, problem, offer, CTA &mdash; the same words as the other ads.
                </p>
              </li>
            ))}
          </ol>
          <Taps
            steps={[
              <>Finish all four ads for one face before you decide anything.</>,
              <>
                Separate &ldquo;the right person&rdquo; from &ldquo;anybody.&rdquo; A busy ad full of the wrong
                people is not the winner.
              </>,
              <>Write down the call-out where that face recognized themselves. That&apos;s the name they answered to.</>,
              <>Then run the other face as its own round. Don&apos;t average the two together.</>,
            ]}
          />
          <Checklist
            id="drop10-read"
            items={[
              "Two avatars, four ads each",
              "Inside one avatar's ads, the body is the same words",
              "The only edit between those ads is the call-out",
              "I'll read each face on their own",
              "I'll write down what each one liked to be called",
            ]}
          />
          <Note>
            Change the call-out only. If the body moves too, you won&apos;t know what worked.
          </Note>
          <Go href="https://nextbysophie.com/newsletter">get the next drop</Go>
        </div>
      ),
    },
  ],
};
