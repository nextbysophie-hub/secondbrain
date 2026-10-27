"use client";

import { useState } from "react";
import type { Action, Board } from "@/lib/board";
import {
  FREEBIE_STATUSES,
  type Hub,
  type HubAsset,
  type HubFreebie,
  type HubVideo,
} from "@/lib/contentHub";

type Send = (action: Action, optimistic: (b: Board) => Board) => void;

/** Notion's statuses folded into the columns of the pipeline; `set` is what a
 *  card dropped on the column becomes. */
const STAGES = [
  { id: "idea", label: "Ideas", set: "Idea", match: ["Drafts", "Idea", "Idea on Content Calendar"] },
  { id: "scripted", label: "Scripted", set: "Scripted", match: ["Scripted"] },
  { id: "filming", label: "Filming", set: "Filming", match: ["Filming"] },
  { id: "editing", label: "Editing", set: "Editing", match: ["Editing"] },
  { id: "ready", label: "Ready to post", set: "Approved for publishing", match: ["Approved for publishing", "Scheduled"] },
  { id: "posted", label: "Posted", set: "Published", match: ["Published"] },
  { id: "hold", label: "On hold", set: "On hold", match: ["On hold"] },
] as const;
type StageId = (typeof STAGES)[number]["id"];
const RANK: Record<StageId, number> = { posted: 6, ready: 5, editing: 4, filming: 3, scripted: 2, idea: 1, hold: 0 };

const stageOf = (s: string | null): StageId =>
  STAGES.find((x) => (x.match as readonly string[]).includes(s ?? ""))?.id ?? "idea";
const isReady = (v: HubVideo) => RANK[stageOf(v.status)] >= RANK.ready;

/** The monthly split: 30 pieces, 10 of each. `steps` are the meters, each
 *  counting pieces that have reached at least that stage. */
const FORMATS = [
  { id: "Carousel", label: "Carousels", who: "swipe posts", target: 10, steps: [["Written", "scripted"], ["Designed", "editing"], ["Approved", "ready"]] },
  { id: "Yap", label: "Yaps", who: "Brent Cooper style · easy edit", target: 10, steps: [["Scripted", "scripted"], ["Filmed", "editing"], ["Edited", "ready"]] },
  { id: "Talking head", label: "Talking heads", who: "fully edited · Chandan", target: 10, steps: [["Scripted", "scripted"], ["Filmed", "editing"], ["Edited", "ready"]] },
] as const;
const WEIGHT: Record<StageId, number> = { idea: 0.1, scripted: 0.3, filming: 0.5, editing: 0.75, ready: 1, posted: 1, hold: 0 };

/** Set in Notion's "Format", else guessed from the content type or editor. */
const formatOf = (v: HubVideo): string | null =>
  v.format ??
  (v.type === "Carrusels"
    ? "Carousel"
    : v.editor === "Bernal"
      ? "Yap"
      : v.editor === "Chandan Deshmukh" || v.type === "Talking Head"
        ? "Talking head"
        : null);

/** December 2026 is the first month with a post every day. */
const FIRST_DAILY = new Date(2026, 11, 1);
const CATCH_UP = new Date(2026, 10, 1);

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: Date) => ymd(d).slice(0, 7);
const monthName = (d: Date) => d.toLocaleDateString("en-US", { month: "long" });
const short = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const daysIn = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const DAY_MS = 86400000;

/** The month being made right now: December until it starts, then always next month. */
function aheadPlan(today: Date) {
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const target = next < FIRST_DAILY ? FIRST_DAILY : next;
  const phase = today < CATCH_UP ? "warmup" : today < FIRST_DAILY ? "catchup" : "daily";
  return { target, phase } as const;
}

const withHub = (b: Board, f: (h: Hub) => Hub): Board => (b.hub ? { ...b, hub: f(b.hub) } : b);
const patchVideo = (id: string, p: Partial<HubVideo>) => (b: Board) =>
  withHub(b, (h) => ({ ...h, videos: h.videos?.map((v) => (v.id === id ? { ...v, ...p } : v)) ?? null }));
const patchFreebie = (id: string, p: Partial<HubFreebie>) => (b: Board) =>
  withHub(b, (h) => ({ ...h, freebies: h.freebies?.map((v) => (v.id === id ? { ...v, ...p } : v)) ?? null }));
const patchAsset = (id: string, p: Partial<HubAsset>) => (b: Board) =>
  withHub(b, (h) => ({ ...h, assets: h.assets?.map((v) => (v.id === id ? { ...v, ...p } : v)) ?? null }));

function NotShared({ name }: { name: string }) {
  return (
    <div className="hub-box space-y-2 text-[14px] text-muted">
      <p>I can&rsquo;t see your {name} database yet. To share it:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Open {name} in Notion.</li>
        <li>Click ••• at the top right, then Connections.</li>
        <li>Add the integration you connected when you set up your second brain.</li>
      </ol>
      <p>Then refresh this page.</p>
    </div>
  );
}

/** A text box that saves to Notion when you leave it or press Enter. */
function Field({
  value,
  placeholder,
  onSave,
  className = "",
}: {
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => void;
  className?: string;
}) {
  const [v, setV] = useState(value ?? "");
  const commit = () => {
    const next = v.trim() || null;
    if (next !== (value || null)) onSave(next);
  };
  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={`hub-input ${className}`}
    />
  );
}

function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  const add = () => {
    if (!v.trim()) return;
    onAdd(v.trim());
    setV("");
  };
  return (
    <div className="flex gap-2">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder={placeholder}
        className="hub-input min-w-0 flex-1"
      />
      <button type="button" onClick={add} className="hub-btn">
        Add
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ the tracker */

function AheadCard({ videos, onTile }: { videos: HubVideo[]; onTile: () => void }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { target, phase } = aheadPlan(today);
  const key = monthKey(target);
  const days = daysIn(target);
  const byDay = new Map<string, HubVideo[]>();
  for (const v of videos)
    if (v.post?.startsWith(key)) byDay.set(v.post, [...(byDay.get(v.post) ?? []), v]);
  const best = (d: string) => {
    const list = byDay.get(d) ?? [];
    return list.length
      ? list.map((v) => stageOf(v.status)).sort((a, b) => RANK[b] - RANK[a])[0]
      : null;
  };
  const dates = Array.from({ length: days }, (_, i) => `${key}-${pad(i + 1)}`);
  const ready = dates.filter((d) => (byDay.get(d) ?? []).some(isReady)).length;
  const slotted = dates.filter((d) => byDay.has(d)).length;
  const left = days - ready;
  const daysLeft = Math.max(1, Math.round((target.getTime() - today.getTime()) / DAY_MS));
  const perWeek = Math.ceil(left / Math.max(1, daysLeft / 7));
  const pool = videos.filter((v) => !v.post && !["posted", "hold"].includes(stageOf(v.status)));
  const stageCount = (id: StageId) =>
    videos.filter((v) => v.post?.startsWith(key) && stageOf(v.status) === id).length;
  const todayPost = videos.filter((v) => v.post === ymd(today));
  const M = monthName(target);

  const headline =
    phase === "warmup"
      ? `Catch-up month starts Nov 1`
      : phase === "catchup"
        ? `Catch-up month: making ${M}`
        : `Posting daily · making ${M} now`;
  const sub =
    phase === "warmup"
      ? `${Math.round((CATCH_UP.getTime() - today.getTime()) / DAY_MS)} days to go. November makes all of December, then you stay a month ahead.`
      : phase === "catchup"
        ? `Every December post is made in November, so December is just posting.`
        : `${M} gets made this month, so you're always a month ahead.`;

  return (
    <section className="hub-ahead">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="hub-kicker">Month-ahead tracker</p>
          <h2 className="display mt-1 text-[22px] font-bold leading-tight sm:text-[26px]">{headline}</h2>
          <p className="mt-1 max-w-[560px] text-[13.5px] text-muted">{sub}</p>
        </div>
        <div className="text-right">
          <p className="display text-[40px] font-bold leading-none">
            {ready}
            <span className="text-[20px] text-muted">/{days}</span>
          </p>
          <p className="mt-1 text-[12px] text-muted">days of {M} ready to post</p>
        </div>
      </div>

      <button type="button" onClick={onTile} className="hub-tiles" title="Open the calendar">
        {dates.map((d) => {
          const s = best(d);
          return (
            <span key={d} className={`hub-tile ${s ? `hub-st-${s}` : ""}`} title={`${short(d)}${s ? ` · ${byDay.get(d)?.[0]?.title}` : " · empty"}`}>
              {Number(d.slice(8))}
            </span>
          );
        })}
      </button>

      <div className="mt-4 flex flex-wrap gap-2 text-[12.5px]">
        <span className="hub-stat">
          <b>{slotted}</b> of {days} days have a video
        </span>
        {(["ready", "editing", "filming", "scripted", "idea"] as StageId[]).map((id) =>
          stageCount(id) ? (
            <span key={id} className={`hub-stat hub-st-${id}`}>
              <b>{stageCount(id)}</b> {STAGES.find((s) => s.id === id)?.label.toLowerCase()}
            </span>
          ) : null,
        )}
        <span className="hub-stat">
          <b>{pool.length}</b> in the pipeline, not on a day yet
        </span>
      </div>

      <p className="mt-3 text-[13.5px]">
        {left === 0 ? (
          <>All of {M} is ready. You&rsquo;re a month ahead.</>
        ) : (
          <>
            <b>{left} more</b> to finish before {short(ymd(target))} — about <b>{perWeek} a week</b>
            {daysLeft < 60 ? <> ({(left / daysLeft).toFixed(1)} a day)</> : null}.
          </>
        )}
      </p>
      {phase === "daily" ? (
        <p className="mt-1 text-[13.5px]">
          <b>Today&rsquo;s post:</b>{" "}
          {todayPost.length ? todayPost.map((v) => v.title).join(" · ") : "nothing on the calendar"}
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------- month progress */

/** A piece counts toward a month only once it's on one of that month's days. */
const inMonth = (v: HubVideo, key: string) => !!v.post?.startsWith(key);

function Meter({ label, n, of, cls }: { label: string; n: number; of: number; cls: string }) {
  return (
    <div className="hub-mrow">
      <span className="w-[68px] shrink-0 text-muted">{label}</span>
      <div className="hub-meter">
        <span className={cls} style={{ width: `${Math.min(100, (100 * n) / of)}%` }} />
      </div>
      <b className="w-[38px] shrink-0 text-right tabular-nums">
        {n}/{of}
      </b>
    </div>
  );
}

function MonthProgress({ videos, onUnsorted, onPlan }: { videos: HubVideo[]; onUnsorted: () => void; onPlan: () => void }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { target } = aheadPlan(today);
  const key = monthKey(target);
  const M = monthName(target);
  const mine = videos.filter((v) => inMonth(v, key));
  const rows = FORMATS.map((f) => {
    const list = mine
      .filter((v) => formatOf(v) === f.id)
      .sort((a, b) => RANK[stageOf(b.status)] - RANK[stageOf(a.status)]);
    const reached = (s: StageId) =>
      Math.min(f.target, list.filter((v) => RANK[stageOf(v.status)] >= RANK[s]).length);
    const score = list.slice(0, f.target).reduce((n, v) => n + WEIGHT[stageOf(v.status)], 0);
    return { f, list, reached, score, ready: reached("ready") };
  });
  const total = rows.reduce((n, r) => n + r.f.target, 0);
  const ready = rows.reduce((n, r) => n + r.ready, 0);
  const pct = Math.round((100 * rows.reduce((n, r) => n + r.score, 0)) / total);
  const unsorted = mine.filter((v) => !formatOf(v)).length;

  return (
    <section className="hub-box">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="hub-kicker">{M} progress</p>
          <h2 className="display mt-1 text-[22px] font-bold leading-tight sm:text-[26px]">
            {pct}% of {M} made
          </h2>
          <p className="mt-1 text-[13.5px] text-muted">
            <b className="text-ink">{ready}</b> of {total} pieces ready to post ·{" "}
            {FORMATS.map((f) => `${f.target} ${f.label.toLowerCase()}`).join(", ")}
          </p>
        </div>
      </div>
      <div className="hub-meter hub-meter-lg mt-3">
        <span className="hub-fill-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="hub-fmts">
        {rows.map(({ f, list, reached, ready: r }) => {
          const cls = `hub-fill-${f.id.toLowerCase().replace(" ", "-")}`;
          return (
            <div key={f.id} className="hub-fmt">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{f.label}</p>
                  <p className="text-[12px] text-muted">{f.who}</p>
                </div>
                <p className="display shrink-0 text-right text-[28px] font-bold leading-none">
                  {r}
                  <span className="text-[15px] text-muted">/{f.target}</span>
                  <span className="block text-[11px] font-normal text-muted">ready</span>
                </p>
              </div>
              <div className="mt-3 space-y-1.5">
                <Meter label="Planned" n={reached("idea")} of={f.target} cls={cls} />
                {f.steps.map(([label, s]) => (
                  <Meter key={label} label={label} n={reached(s)} of={f.target} cls={cls} />
                ))}
              </div>
              {list.length > f.target ? (
                <p className="mt-2 text-[12px] text-muted">+{list.length - f.target} extra in the works</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {!mine.length ? (
        <button type="button" onClick={onPlan} className="mt-3 text-left text-[12.5px] text-muted underline">
          Nothing is on a {M} day yet. Put pieces on days in the Calendar and they&rsquo;ll count here.
        </button>
      ) : unsorted ? (
        <button type="button" onClick={onUnsorted} className="mt-3 text-left text-[12.5px] text-muted underline">
          {unsorted} {M} {unsorted === 1 ? "piece has" : "pieces have"} no format yet, so {unsorted === 1 ? "it isn't" : "they aren't"} counted. Tap a card in the pipeline to set one.
        </button>
      ) : null}
    </section>
  );
}

/* ----------------------------------------------------------- one video */

function VideoDetail({ v, send, onClose }: { v: HubVideo; send: Send; onClose?: () => void }) {
  const cur = stageOf(v.status);
  return (
    <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1.5">
        {STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`hub-pill ${cur === s.id ? `on hub-st-${s.id}` : ""}`}
            onClick={() =>
              cur !== s.id &&
              send({ action: "hubVideoStatus", id: v.id, status: s.set }, patchVideo(v.id, { status: s.set }))
            }
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
        Format
        {FORMATS.map((f) => {
          const on = formatOf(v) === f.id;
          const next = on && v.format ? null : f.id;
          return (
            <button
              key={f.id}
              type="button"
              className={`hub-pill hub-pill-dark ${on ? "on" : ""}`}
              onClick={() => send({ action: "hubVideoFormat", id: v.id, format: next }, patchVideo(v.id, { format: next }))}
            >
              {f.id}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-muted">
        Posts on
        <input
          type="date"
          value={v.post ?? ""}
          onChange={(e) =>
            send(
              { action: "hubVideoPost", id: v.id, date: e.target.value || null },
              patchVideo(v.id, { post: e.target.value || null }),
            )
          }
          className="hub-input !py-1"
        />
        {v.post ? (
          <button
            type="button"
            className="text-[12px] underline"
            onClick={() => send({ action: "hubVideoPost", id: v.id, date: null }, patchVideo(v.id, { post: null }))}
          >
            take off the calendar
          </button>
        ) : null}
      </label>
      <div className="flex items-center justify-between gap-2">
        <a href={v.url} target="_blank" rel="noreferrer" className="ci-go">
          Open script in Notion ↗
        </a>
        {onClose ? (
          <button type="button" className="text-[12px] text-muted" onClick={onClose}>
            close
          </button>
        ) : null}
      </div>
    </div>
  );
}

function VideoCard({ v, send }: { v: HubVideo; send: Send }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/hub-video", v.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => setOpen(!open)}
      className="hub-card cursor-pointer"
    >
      <p className="text-[13.5px] font-semibold leading-snug">{v.title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {v.post ? <span className="ci-tag hub-tag-post">posts {short(v.post)}</span> : null}
        {formatOf(v) ? <span className="ci-tag hub-tag-fmt">{formatOf(v)}</span> : null}
        {v.type && !["Carrusels", "Talking Head"].includes(v.type) ? <span className="ci-tag">{v.type}</span> : null}
        {v.editor && !["Yes", "No"].includes(v.editor) ? <span className="ci-tag">ed. {v.editor}</span> : null}
        {v.film && stageOf(v.status) !== "posted" ? <span className="ci-tag">film {short(v.film)}</span> : null}
      </div>
      {open ? <VideoDetail v={v} send={send} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------ pipeline */

function Pipeline({ videos, send }: { videos: HubVideo[]; send: Send }) {
  const [over, setOver] = useState<StageId | null>(null);
  const [allPosted, setAllPosted] = useState(false);
  const move = (id: string, stage: (typeof STAGES)[number]) => {
    const v = videos.find((x) => x.id === id);
    if (!v || stageOf(v.status) === stage.id) return;
    send({ action: "hubVideoStatus", id, status: stage.set }, patchVideo(id, { status: stage.set }));
  };
  const when = (v: HubVideo) => v.post ?? v.turnIn ?? "";
  return (
    <div className="hub-cols">
      {STAGES.map((s) => {
        let list = videos.filter((v) => stageOf(v.status) === s.id);
        list =
          s.id === "posted"
            ? [...list].sort((a, b) => when(b).localeCompare(when(a)))
            : [...list].sort((a, b) => (a.post ?? "9999").localeCompare(b.post ?? "9999"));
        const shown = s.id === "posted" && !allPosted ? list.slice(0, 6) : list;
        return (
          <section
            key={s.id}
            className={`hub-col ${over === s.id ? "is-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s.id);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/hub-video");
              if (id) move(id, s);
            }}
          >
            <header className="mb-2 flex items-center justify-between px-1">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                <span className={`hub-dot hub-st-${s.id}`} />
                {s.label}
              </h3>
              <span className="text-[12px] text-muted">{list.length}</span>
            </header>
            {s.id === "idea" ? (
              <div className="mb-2">
                <AddLine
                  placeholder="New idea…"
                  onAdd={(title) =>
                    send({ action: "hubAddVideo", title, status: "Idea" }, (b) =>
                      withHub(b, (h) => ({
                        ...h,
                        videos: [
                          { id: `tmp-${Date.now()}`, title, status: "Idea", type: null, editor: null, format: null, film: null, post: null, turnIn: null, postUrl: null, url: "#" },
                          ...(h.videos ?? []),
                        ],
                      })),
                    )
                  }
                />
              </div>
            ) : null}
            <div className="space-y-2">
              {shown.map((v) => (
                <VideoCard key={v.id} v={v} send={send} />
              ))}
              {!list.length ? <p className="px-1 py-3 text-[12.5px] text-faint">Drop a card here</p> : null}
              {s.id === "posted" && list.length > 6 ? (
                <button type="button" className="px-1 text-[12.5px] text-muted underline" onClick={() => setAllPosted(!allPosted)}>
                  {allPosted ? "show fewer" : `show all ${list.length}`}
                </button>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ calendar */

function Calendar({ videos, send }: { videos: HubVideo[]; send: Send }) {
  const [month, setMonth] = useState(() => aheadPlan(new Date()).target);
  const [picking, setPicking] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const key = monthKey(month);
  const days = daysIn(month);
  const lead = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const today = ymd(new Date());
  const onDay = (d: string) => videos.filter((v) => v.post === d);
  const pool = videos
    .filter((v) => !v.post && !["posted", "hold"].includes(stageOf(v.status)))
    .sort((a, b) => RANK[stageOf(b.status)] - RANK[stageOf(a.status)]);
  const slot = (id: string, d: string | null) =>
    send({ action: "hubVideoPost", id, date: d }, patchVideo(id, { post: d }));
  const opened = videos.find((v) => v.id === openId) ?? null;
  const filled = Array.from({ length: days }, (_, i) => `${key}-${pad(i + 1)}`).filter((d) => onDay(d).length).length;
  const shift = (n: number) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
    setPicking(null);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <section className="hub-box">
        <header className="mb-3 flex items-center justify-between gap-3">
          <button type="button" className="hub-pill" onClick={() => shift(-1)} aria-label="Previous month">
            ‹
          </button>
          <div className="text-center">
            <h3 className="display text-[18px] font-bold">
              {monthName(month)} {month.getFullYear()}
            </h3>
            <p className="text-[12px] text-muted">
              {filled} of {days} days filled
            </p>
          </div>
          <button type="button" className="hub-pill" onClick={() => shift(1)} aria-label="Next month">
            ›
          </button>
        </header>
        <div className="hub-cal">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
            <span key={w} className="hub-wd">
              {w}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const d = `${key}-${pad(i + 1)}`;
            const list = onDay(d);
            return (
              <div
                key={d}
                onClick={() => setPicking(picking === d ? null : d)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(d);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const id = e.dataTransfer.getData("text/hub-video");
                  if (id) slot(id, d);
                }}
                className={`hub-day ${list.length ? "" : "is-empty"} ${picking === d ? "is-picking" : ""} ${over === d ? "is-over" : ""} ${d === today ? "is-today" : ""}`}
              >
                <span className="hub-daynum">{i + 1}</span>
                {list.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/hub-video", v.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenId(v.id);
                      setPicking(null);
                    }}
                    className={`hub-slot hub-st-${stageOf(v.status)}`}
                    title={`${v.title} · ${v.status ?? ""}`}
                  >
                    {v.title}
                  </button>
                ))}
                {!list.length ? <span className="hub-plus">+</span> : null}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11.5px] text-muted">
          {STAGES.filter((s) => s.id !== "hold").map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className={`hub-dot hub-st-${s.id}`} />
              {s.label}
            </span>
          ))}
        </div>
      </section>

      <aside className="space-y-4">
        {opened ? (
          <section className="hub-box">
            <p className="hub-kicker">On the calendar</p>
            <p className="mt-1 text-[14px] font-semibold">{opened.title}</p>
            <VideoDetail v={opened} send={send} onClose={() => setOpenId(null)} />
          </section>
        ) : null}
        <section
          className={`hub-box hub-pool ${over === "pool" ? "is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver("pool");
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            const id = e.dataTransfer.getData("text/hub-video");
            if (id && videos.find((v) => v.id === id)?.post) slot(id, null);
          }}
        >
          <p className="hub-kicker">
            {picking ? `Pick a video for ${short(picking)}` : "Not on a day yet"}
          </p>
          <p className="mb-2 mt-1 text-[12px] text-muted">
            {picking
              ? "Tap one to put it on that day."
              : "Drag one onto a day, or tap a day first. Put one on the wrong day? Drag it back here."}
          </p>
          <div className="max-h-[520px] space-y-1.5 overflow-y-auto">
            {pool.map((v) => (
              <button
                key={v.id}
                type="button"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/hub-video", v.id)}
                onClick={() => {
                  if (picking) {
                    slot(v.id, picking);
                    setPicking(null);
                  } else setOpenId(v.id);
                }}
                className={`hub-poolrow ${picking ? "is-picking" : ""}`}
              >
                <span className={`hub-dot hub-st-${stageOf(v.status)}`} />
                <span className="min-w-0 flex-1 truncate text-left">{v.title}</span>
                <span className="text-[11px] text-faint">{STAGES.find((s) => s.id === stageOf(v.status))?.label}</span>
              </button>
            ))}
            {!pool.length ? <p className="text-[12.5px] text-faint">Everything in the pipeline has a day.</p> : null}
          </div>
        </section>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------ freebies */

function Freebies({ hub, send }: { hub: Hub; send: Send }) {
  const list = hub.freebies;
  if (!list) return <NotShared name="Freebies" />;
  const videos = [...(hub.videos ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  const set = (f: HubFreebie, field: "status" | "link" | "keyword" | "video" | "postedOn", value: string | null) =>
    send(
      { action: "hubFreebie", id: f.id, field, value },
      patchFreebie(f.id, { [field]: value } as Partial<HubFreebie>),
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FREEBIE_STATUSES.map((s) => (
          <span key={s} className={`hub-stat hub-fb-${s.toLowerCase()}`}>
            <b>{list.filter((f) => f.status === s).length}</b> {s.toLowerCase()}
          </span>
        ))}
      </div>
      <AddLine
        placeholder="New freebie…"
        onAdd={(name) =>
          send({ action: "hubAddFreebie", name }, (b) =>
            withHub(b, (h) => ({
              ...h,
              freebies: [
                ...(h.freebies ?? []),
                { id: `tmp-${Date.now()}`, name, status: "Idea", link: null, keyword: "", video: null, postedOn: null, notes: "", url: "#" },
              ],
            })),
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((f) => {
          const video = hub.videos?.find((v) => v.id === f.video);
          return (
            <div key={f.id} className="hub-card !p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14.5px] font-semibold leading-snug">{f.name}</p>
                <a href={f.url} target="_blank" rel="noreferrer" className="ci-notion shrink-0">
                  Notion ↗
                </a>
              </div>
              {f.notes ? <p className="mt-1 text-[12.5px] text-muted">{f.notes}</p> : null}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {FREEBIE_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`hub-pill ${f.status === s ? `on hub-fb-${s.toLowerCase()}` : ""}`}
                    onClick={() => f.status !== s && set(f, "status", s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-2 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <Field key={f.link ?? ""} value={f.link} placeholder="Paste the link" onSave={(v) => set(f, "link", v)} className="min-w-0 flex-1" />
                  {f.link ? (
                    <a href={f.link} target="_blank" rel="noreferrer" className="ci-go shrink-0">
                      Open ↗
                    </a>
                  ) : null}
                </div>
                <Field key={`k${f.keyword}`} value={f.keyword} placeholder="Comment keyword (e.g. TOKENS)" onSave={(v) => set(f, "keyword", v)} className="w-full" />
                <select
                  value={f.video ?? ""}
                  onChange={(e) => set(f, "video", e.target.value || null)}
                  className="hub-input w-full"
                >
                  <option value="">No video yet</option>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title}
                    </option>
                  ))}
                </select>
                {video ? (
                  <p className="text-muted">
                    Video is <b className="text-ink">{video.status ?? "no status"}</b>
                    {video.post ? ` · posts ${short(video.post)}` : ""}
                  </p>
                ) : null}
                <label className="flex items-center gap-2 text-muted">
                  Posted on
                  <input
                    type="date"
                    value={f.postedOn ?? ""}
                    onChange={(e) => set(f, "postedOn", e.target.value || null)}
                    className="hub-input !py-1"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- assets */

function Assets({ hub, send }: { hub: Hub; send: Send }) {
  const list = hub.assets;
  const [type, setType] = useState("");
  if (!list) return <NotShared name="Content Assets" />;
  const todo = list.filter((a) => !a.done).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const done = list.filter((a) => a.done);
  const types = [...new Set([...hub.assetTypes, ...done.map((a) => a.type ?? "Other")])];
  const today = ymd(new Date());
  const tick = (a: HubAsset) =>
    send({ action: "hubAsset", id: a.id, field: "done", value: !a.done }, patchAsset(a.id, { done: !a.done }));
  const link = (a: HubAsset, v: string | null) =>
    send({ action: "hubAsset", id: a.id, field: "link", value: v }, patchAsset(a.id, { link: v }));
  const pct = list.length ? Math.round((done.length / list.length) * 100) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <section className="hub-box">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="hub-kicker">To make</p>
            <p className="mt-1 text-[13px] text-muted">Tick it when it&rsquo;s made and paste the link — it moves to the library.</p>
          </div>
          <p className="shrink-0 text-[13px]">
            <b>{done.length}</b>/{list.length} made
          </p>
        </div>
        <div className="hub-bar mt-3">
          <span style={{ width: `${pct}%` }} />
        </div>
        <ul className="mt-4 space-y-2">
          {todo.map((a) => (
            <li key={a.id} className="hub-asset">
              <button type="button" className="hub-check" aria-label={`Mark ${a.name} made`} onClick={() => tick(a)} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium leading-snug">{a.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {a.type ? <span className="ci-tag">{a.type}</span> : null}
                  {a.due ? (
                    <span className={`ci-tag ${a.due < today ? "hub-late" : ""}`}>by {short(a.due)}</span>
                  ) : null}
                </div>
                <Field key={a.link ?? ""} value={a.link} placeholder="Paste the link when it's made" onSave={(v) => link(a, v)} className="mt-2 w-full" />
              </div>
            </li>
          ))}
          {!todo.length ? <li className="text-[13px] text-muted">Everything&rsquo;s made. 🎉</li> : null}
        </ul>
        <div className="mt-4 flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="hub-input shrink-0">
            <option value="">Type</option>
            {hub.assetTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <div className="min-w-0 flex-1">
            <AddLine
              placeholder="Another asset to make…"
              onAdd={(name) =>
                send({ action: "hubAddAsset", name, type: type || null }, (b) =>
                  withHub(b, (h) => ({
                    ...h,
                    assets: [
                      ...(h.assets ?? []),
                      { id: `tmp-${Date.now()}`, name, done: false, link: null, type: type || null, due: null, url: "#" },
                    ],
                  })),
                )
              }
            />
          </div>
        </div>
      </section>

      <section className="hub-box">
        <p className="hub-kicker">Asset library</p>
        <p className="mt-1 text-[13px] text-muted">Every link the team needs, in one place.</p>
        <div className="mt-4 space-y-4">
          {types
            .map((t) => ({ t, items: done.filter((a) => (a.type ?? "Other") === t) }))
            .filter((g) => g.items.length)
            .map((g) => (
              <div key={g.t}>
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">{g.t}</p>
                <ul className="space-y-1.5">
                  {g.items.map((a) => (
                    <li key={a.id} className="hub-librow">
                      <button type="button" className="hub-check is-on" aria-label={`Mark ${a.name} not made`} onClick={() => tick(a)}>
                        ✓
                      </button>
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">{a.name}</span>
                      {a.link ? (
                        <a href={a.link} target="_blank" rel="noreferrer" className="ci-go shrink-0">
                          Open ↗
                        </a>
                      ) : (
                        <Field key="" value={null} placeholder="add link" onSave={(v) => link(a, v)} className="w-[120px] !py-1" />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          {!done.length ? <p className="text-[13px] text-faint">Nothing made yet — tick things off on the left.</p> : null}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ editors */

/** Select options that say whether an editor is needed rather than who. */
const NOT_A_PERSON = ["Yes", "No", "Editor"];
/** The editors she works with now; anyone else's cards wait in Unassigned. */
const TEAM = ["Chandan Deshmukh", "Muskan", "Momin"];
const editorOf = (v: HubVideo) => (v.editor && !NOT_A_PERSON.includes(v.editor) ? v.editor : null);
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label])) as Record<StageId, string>;

/** Who is working on what: one column per editor plus the ideas nobody has yet. */
export function EditorsHub({ board, send }: { board: Board; send: Send }) {
  const hub = board.hub;
  const [over, setOver] = useState<string | null>(null);
  const [showPosted, setShowPosted] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  if (!hub) return <p className="py-10 text-center text-[14px] text-muted">Couldn&rsquo;t read the Content Hub from Notion. Try syncing again.</p>;
  if (!hub.videos) return <NotShared name="Content Calendar" />;
  const videos = hub.videos;
  const people = [...new Set([...TEAM, ...added])];
  const columnOf = (v: HubVideo) => {
    const e = editorOf(v);
    return e && people.includes(e) ? e : null;
  };
  const live = (v: HubVideo) => showPosted || stageOf(v.status) !== "posted";
  const assign = (id: string, editor: string | null) => {
    const v = videos.find((x) => x.id === id);
    if (!v || columnOf(v) === editor) return;
    send({ action: "hubVideoEditor", id, editor }, patchVideo(id, { editor }));
  };
  const addIdea = (title: string, editor: string | null) =>
    send({ action: "hubAddVideo", title, status: "Idea", editor }, (b) =>
      withHub(b, (h) => ({
        ...h,
        videos: [
          { id: `tmp-${Date.now()}`, title, status: "Idea", type: null, editor, format: null, film: null, post: null, turnIn: null, postUrl: null, url: "#" },
          ...(h.videos ?? []),
        ],
      })),
    );
  const addPerson = () => {
    const name = newName.trim().replace(/,/g, "");
    if (!name) return;
    setNewName("");
    if (!people.includes(name)) setAdded([...added, name]);
  };
  const columns: { key: string; label: string; editor: string | null }[] = [
    { key: "__none", label: "Unassigned", editor: null },
    ...people.map((p) => ({ key: p, label: p.split(" ")[0], editor: p })),
  ];
  const byStage = (a: HubVideo, b: HubVideo) =>
    RANK[stageOf(b.status)] - RANK[stageOf(a.status)] || (a.post ?? "9999").localeCompare(b.post ?? "9999");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Who is working on what. Drag a card onto an editor to hand it over, or tap it to pick one.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`hub-pill ${showPosted ? "on" : ""}`} onClick={() => setShowPosted(!showPosted)}>
            {showPosted ? "Hide posted" : "Show posted"}
          </button>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPerson()}
            placeholder="+ Add an editor"
            className="hub-input w-40"
          />
        </div>
      </div>
      <div className="hub-cols">
        {columns.map((c) => {
          const list = videos.filter((v) => columnOf(v) === c.editor && live(v)).sort(byStage);
          const working = list.filter((v) => !["posted", "ready", "hold"].includes(stageOf(v.status))).length;
          return (
            <section
              key={c.key}
              className={`hub-col ${over === c.key ? "is-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(c.key);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/hub-video");
                if (id) assign(id, c.editor);
              }}
            >
              <header className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-[13px] font-semibold">{c.label}</h3>
                <span className="text-[12px] text-muted">{c.editor ? `${working} in progress` : list.length}</span>
              </header>
              <div className="mb-2">
                <AddLine placeholder={c.editor ? `New idea for ${c.label}…` : "New idea…"} onAdd={(t) => addIdea(t, c.editor)} />
              </div>
              <div className="space-y-2">
                {list.map((v) => (
                  <EditorCard key={v.id} v={v} send={send} people={people} onAssign={assign} />
                ))}
                {!list.length ? <p className="px-1 py-3 text-[12.5px] text-faint">Drop a card here</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EditorCard({
  v,
  send,
  people,
  onAssign,
}: {
  v: HubVideo;
  send: Send;
  people: string[];
  onAssign: (id: string, editor: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const stage = stageOf(v.status);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/hub-video", v.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => setOpen(!open)}
      className="hub-card cursor-pointer"
    >
      <p className="text-[13.5px] font-semibold leading-snug">{v.title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={`ci-tag hub-st-${stage}`}>{STAGE_LABEL[stage]}</span>
        {editorOf(v) && !people.includes(editorOf(v) as string) ? <span className="ci-tag">was {editorOf(v)}</span> : null}
        {v.post ? <span className="ci-tag hub-tag-post">posts {short(v.post)}</span> : null}
        {formatOf(v) ? <span className="ci-tag hub-tag-fmt">{formatOf(v)}</span> : null}
      </div>
      {open ? (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
            Editor
            {[...people, null].map((p) => (
              <button
                key={p ?? "none"}
                type="button"
                className={`hub-pill hub-pill-dark ${editorOf(v) === p ? "on" : ""}`}
                onClick={() => onAssign(v.id, p)}
              >
                {p ? p.split(" ")[0] : "Nobody"}
              </button>
            ))}
          </div>
          <VideoDetail v={v} send={send} onClose={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- pane */

const VIEWS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "calendar", label: "Calendar" },
  { id: "freebies", label: "Freebies" },
  { id: "assets", label: "Assets" },
] as const;

export function ContentHub({ board, send }: { board: Board; send: Send }) {
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("pipeline");
  const hub = board.hub;
  if (!hub) return <p className="py-10 text-center text-[14px] text-muted">Couldn&rsquo;t read the Content Hub from Notion. Try syncing again.</p>;
  const videos = hub.videos ?? [];
  return (
    <div className="space-y-5">
      {hub.videos ? <AheadCard videos={videos} onTile={() => setView("calendar")} /> : null}
      {hub.videos ? <MonthProgress videos={videos} onUnsorted={() => setView("pipeline")} onPlan={() => setView("calendar")} /> : null}
      <div className="seg seg-lg" role="group" aria-label="Content hub view">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      {view === "pipeline" ? (
        hub.videos ? <Pipeline videos={videos} send={send} /> : <NotShared name="Content Calendar" />
      ) : view === "calendar" ? (
        hub.videos ? <Calendar videos={videos} send={send} /> : <NotShared name="Content Calendar" />
      ) : view === "freebies" ? (
        <Freebies hub={hub} send={send} />
      ) : (
        <Assets hub={hub} send={send} />
      )}
    </div>
  );
}
