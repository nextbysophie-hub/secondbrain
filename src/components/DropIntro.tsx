"use client";

import Image from "next/image";
import { StepProps } from "@/components/steps";

/** The first screen of a drop: what you're building, why, and what it costs you. */
export function DropIntro({ next }: StepProps) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <span className="inline-block rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-cream">
          Drop 01
        </span>
        <h1 className="mt-4 text-[38px] font-black leading-[0.95] tracking-[-0.045em] sm:text-[52px]">
          Talk to your
          <br />
          to-do list.
        </h1>
        <p className="mx-auto mt-4 max-w-[330px] text-[15px] font-medium leading-relaxed text-muted">
          Say it out loud and it&apos;s written down for you &mdash; ideas in one list, to-dos in another, without
          unlocking your phone.
        </p>
      </div>

      <div className="relative rounded-3xl border-2 border-brand-cocoa bg-panel-2 px-5 pb-5 pt-12 shadow-[5px_6px_0_var(--brand-cocoa)]">
        <span className="absolute -top-3 left-5 rounded-full bg-brand-yellow px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-cocoa">
          the goal
        </span>
        <Image
          src="/robot.png"
          alt=""
          width={515}
          height={520}
          priority
          className="pop pointer-events-none absolute -top-[62px] right-2 h-[78px] w-auto drop-shadow-[0_10px_14px_rgba(70,46,41,0.25)]"
        />
        <p className="text-[17px] font-semibold leading-snug">
          By the end of this page you can say{" "}
          <span className="text-accent">&ldquo;Hey Siri, capture idea&rdquo;</span> and watch it land in your Notion
          three seconds later &mdash; from the car, the shower door, the middle of a conversation.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          You&apos;re building it yourself: two Notion databases and two Siri shortcuts, wired together. It stays
          yours &mdash; no app, no subscription.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          ["10 min", "start to finish"],
          ["0 code", "copy, paste, tap"],
          ["iPhone", "+ a Notion account"],
        ].map(([big, small]) => (
          <div key={big} className="rounded-2xl border border-line bg-panel px-2 py-3">
            <div className="text-[17px] font-bold leading-none tracking-tight">{big}</div>
            <div className="mt-1.5 text-[11.5px] font-medium leading-tight text-muted">{small}</div>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-line bg-panel px-5 py-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">what you&apos;ll build</div>
        <ol className="mt-3 space-y-3">
          {[
            ["Give Notion a key", "one copy-paste so your phone is allowed to write into it"],
            ["Make the two lists", "ideas in one, to-dos in the other, built for you"],
            ["Build the two shortcuts", "\u201ccapture idea\u201d and \u201ccapture to-do\u201d, step by step"],
            ["Say it out loud", "and see it appear in Notion while you watch"],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-cocoa text-[12px] font-bold text-brand-cream">
                {i + 1}
              </span>
              <span className="text-[14.5px] leading-snug">
                <strong className="font-bold">{t}</strong>
                <span className="text-muted"> &mdash; {d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <button
          type="button"
          onClick={next}
          className="w-full rounded-full bg-brand-yellow px-6 py-4 text-[17px] font-bold text-brand-cocoa shadow-[0_8px_22px_rgba(255,199,60,0.45)] active:translate-y-px"
        >
          Start building
        </button>
        <p className="mt-3 text-center text-[12.5px] leading-relaxed text-muted">
          Stuck on any step? Tap <strong className="font-bold text-ink">Stuck? Ask me</strong> at the bottom and it
          gets explained in plain English.
        </p>
      </div>

      <div className="flex justify-center pt-2">
        <div
          className="flex h-[150px] w-[150px] rotate-[-11deg] flex-col items-center justify-center rounded-full border-4 border-accent/90 text-center text-accent shadow-[inset_0_0_0_3px_rgba(137,46,26,0.25)]"
          role="img"
          aria-label="Guaranteed dummy proof: if you can tap, you can build it"
        >
          <span className="text-[10px] font-black uppercase tracking-[0.22em]">guaranteed</span>
          <span className="mt-1 text-[27px] font-black uppercase leading-[0.9] tracking-tight">
            dummy
            <br />
            proof
          </span>
          <span className="mt-1.5 max-w-[104px] border-t-2 border-accent/50 pt-1.5 text-[8.5px] font-bold uppercase leading-tight tracking-[0.06em]">
            if you can tap, you can build it
          </span>
        </div>
      </div>
    </div>
  );
}
