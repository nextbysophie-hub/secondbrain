"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Action,
  AgentTask,
  Board,
  Check,
  Deal,
  EmailItem,
  Every,
  Goal,
  Habit,
  HabitTick,
  Idea,
  Reminder,
  Timing,
  Todo,
  WeekGoal,
} from "@/lib/board";

const CATEGORIES = ["Work", "Personal", "Health", "Money", "Other"];
const AREAS = ["Business", "Content", "Health", "Life"];
const CADENCES = ["Daily", "Weekly", "Monthly"];

const NONE = "Uncategorised";
const PALETTE = Array.from({ length: 8 }, (_, i) => `var(--cat-${i})`);

/** Categories come from whichever Notion column the to-dos use, so the colours
 *  are derived from the name rather than a fixed list. */
function catColour(name: string | null): string {
  if (!name || name === NONE) return "var(--cat-none)";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** Rent doesn't care which day suits you. Money that leaves on a date
 *  somebody else set isn't planning material, so the week shows it where it
 *  falls and refuses to let it be dragged somewhere more convenient. */
/** Only something locked by hand (rent, a bill) is pinned to its date; every
 *  other money item is still a reminder that can move. */
const moneyDay = (t: Todo) => t.due ?? t.plan;
const isFixed = (t: Todo) => t.fixed && !!moneyDay(t) && !isCheck(t);

/** The same date one repeat later (or earlier); month steps stick to the
 *  month's last day rather than spilling into the next. */
function stepEvery(day: string, every: Every, by: 1 | -1): string {
  const d = new Date(`${day}T12:00:00`);
  if (every.unit === "day" || every.unit === "week")
    return shiftDay(day, by * every.n * (every.unit === "week" ? 7 : 1));
  const months = by * every.n * (every.unit === "year" ? 12 : 1);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1, 12);
  const last = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return localDay(target);
}

/** A repeating locked item that's been paid has already rolled to its next
 *  date; it still belongs, ticked, on the day it was paid for. */
const paidFor = (t: Todo, day: string) =>
  isFixed(t) &&
  !!t.every &&
  stepEvery(moneyDay(t) as string, t.every, -1) === day;

/** Pin a task to its date, or let it move again. Locking without a date pins
 *  it to whichever day it was planned for, else today. */
function setLocked(todo: Todo, on: boolean, send: Send) {
  const due = on && !moneyDay(todo) ? TODAY : todo.due;
  if (due !== todo.due)
    send(
      { action: "editTodo", id: todo.id, field: "due", value: due },
      (b) => b,
    );
  send(
    {
      action: "editTodo",
      id: todo.id,
      field: "fixed",
      value: on ? "on" : null,
    },
    (b) => ({
      ...b,
      todos: b.todos.map((t) =>
        t.id === todo.id
          ? { ...t, fixed: on, due, slot: on ? null : t.slot }
          : t,
      ),
    }),
  );
  if (on && todo.slot)
    send(
      { action: "editTodo", id: todo.id, field: "slot", value: null },
      (b) => b,
    );
}

function LockButton({
  todo,
  send,
  onDone,
}: {
  todo: Todo;
  send: Send;
  onDone?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        setLocked(todo, !todo.fixed, send);
        onDone?.();
      }}
      className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted transition hover:text-ink"
    >
      {todo.fixed ? "🔓 Unlock — make it movable" : "🔒 Lock — fixed date"}
    </button>
  );
}

/** A follow-up: your side is finished, theirs isn't. The agreement went out
 *  today, the signature is somebody else's move, so the day it gets chased on
 *  is its own line. It stays a normal to-do row in Notion — marked in the
 *  title, so the phone can write one too — and is kept out of the three and
 *  the quick batch, which are for work, not waiting. */
const CHECK_PREFIX = "Check on: ";
const CHECK_RE = /^check on:\s*/i;
const isCheck = (t: Todo) => CHECK_RE.test(t.title);
const checkLabel = (t: Todo) => t.title.replace(CHECK_RE, "");
const checkDay = (t: Todo) => t.plan ?? t.due;
/** "5 days" — how long something has been waiting on somebody else. */
const daysAgo = (day: string) => {
  const n = Math.max(
    1,
    Math.round(
      (new Date(`${TODAY}T12:00:00`).getTime() -
        new Date(`${day}T12:00:00`).getTime()) /
        86400000,
    ),
  );
  return `${n} day${n === 1 ? "" : "s"}`;
};

const categoriesOf = (board: Board) =>
  board.categories?.length ? board.categories : CATEGORIES;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Her day, not UTC's: after 5pm in Austin the UTC date is already tomorrow,
 *  which used to make the board plan the wrong day every evening. */
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
const TODAY = localDay(new Date());

function monthDays(): string[] {
  const now = new Date();
  const days = new Date(
    Date.UTC(now.getFullYear(), now.getMonth() + 1, 0),
  ).getUTCDate();
  return Array.from({ length: days }, (_, i) =>
    iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), i + 1))),
  );
}

/** A month as Monday-first cells, with blanks where the month hasn't started. */
function monthGrid(offset = 0): { label: string; cells: (string | null)[] } {
  const now = new Date();
  const first = new Date(
    Date.UTC(now.getFullYear(), now.getMonth() + offset, 1),
  );
  const days = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  return {
    label: first.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    cells: [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: days }, (_, i) =>
        iso(
          new Date(
            Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1),
          ),
        ),
      ),
    ],
  };
}

const weekday = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

const pretty = (d: string | null) =>
  d
    ? new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : "";

/* ------------------------------------------------------------ small pieces */

function Tick({
  on,
  onChange,
  dim,
  ring,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  dim?: boolean;
  ring?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition ${
        on
          ? "border-ok bg-ok text-brand-cream"
          : `border-line bg-panel text-transparent hover:border-ink/40 ${ring ? "border-2 border-ink/50" : ""}`
      } ${dim ? "opacity-30" : ""}`}
    >
      ✓
    </button>
  );
}

function Box({
  on,
  onChange,
  tone = "ok",
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  tone?: "ok" | "bad";
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border text-[10px] font-medium transition ${
        on
          ? tone === "bad"
            ? "border-bad bg-bad text-brand-cream"
            : "border-ok bg-ok text-brand-cream"
          : "border-line bg-panel text-transparent hover:border-accent/60"
      }`}
    >
      ✓
    </button>
  );
}

function Pills({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="seg">
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          aria-pressed={value === i.id}
          onClick={() => onChange(i.id)}
          className={`!px-3 !py-1 ${
            value === i.id
              ? "!bg-ink !text-accent-ink"
              : ""
          }`}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

function Panel({
  title,
  right,
  tone,
  dropping,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  tone?: "deadline" | "want";
  dropping?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`overflow-hidden rounded-2xl border border-line bg-panel-2 transition ${
        tone ? `panel-${tone}` : ""
      } ${dropping ? "panel-dropping" : ""}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-[13px] font-medium tracking-tight text-ink">
          {title}
        </h2>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function AddRow({
  placeholder,
  onAdd,
  botToggle,
}: {
  placeholder: string;
  onAdd: (v: string, bot: boolean) => void;
  botToggle?: boolean;
}) {
  const [value, setValue] = useState("");
  const [bot, setBot] = useState(false);
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v, bot);
    setValue("");
    setBot(false);
  };
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={bot ? "Tell the assistant what to do…" : placeholder}
        className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[14px] outline-none transition placeholder:text-muted focus:border-ink/30 focus:bg-panel-2"
      />
      {botToggle ? (
        <button
          type="button"
          onClick={() => setBot(!bot)}
          title="Hand this one to the assistant as well"
          className={`shrink-0 rounded-xl border px-3 text-[13px] transition ${
            bot
              ? "border-accent-2 bg-accent-2/10 text-accent-2"
              : "border-line text-muted hover:text-ink"
          }`}
        >
          🤖 for the assistant
        </button>
      ) : null}
      <button
        type="button"
        onClick={submit}
        className="shrink-0 rounded-xl bg-accent px-4 text-[14px] font-medium text-brand-cream transition hover:opacity-85"
      >
        Add
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ panes */

type Send = (action: Action, optimistic: (b: Board) => Board) => void;

function TodoRow({
  todo,
  send,
  cats = [],
  draggable = false,
}: {
  todo: Todo;
  send: Send;
  cats?: string[];
  draggable?: boolean;
}) {
  // One date per task: a deadline is owed on its due date, anything else is
  // only ever planned for a day.
  const dateField = kindOfTodo(todo) === "deadline" ? "due" : "plan";
  const overdue = !todo.done && todo.due && todo.due < TODAY;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sent, setSent] = useState(false);
  const held = useRef<ReturnType<typeof setTimeout> | null>(null);

  const holdStart = () => {
    if (editing) return;
    held.current = setTimeout(() => setMenu(true), 500);
  };
  const holdEnd = () => {
    if (held.current) clearTimeout(held.current);
    held.current = null;
  };

  const toAssistant = () => {
    setMenu(false);
    setSent(true);
    send(
      {
        action: "sendToAgent",
        title: todo.title,
        due: todo.due,
        from: todo.url,
      },
      queueAgent(todo.title, todo.due),
    );
  };

  const rename = () => {
    const value = draft.trim();
    setEditing(false);
    if (!value || value === todo.title) return setDraft(todo.title);
    send({ action: "editTodo", id: todo.id, field: "title", value }, (b) => ({
      ...b,
      todos: b.todos.map((t) =>
        t.id === todo.id ? { ...t, title: value } : t,
      ),
    }));
  };

  const recategorise = (value: string | null) => {
    setPicking(false);
    send(
      { action: "editTodo", id: todo.id, field: "category", value },
      (b) => ({
        ...b,
        todos: b.todos.map((t) =>
          t.id === todo.id ? { ...t, category: value } : t,
        ),
      }),
    );
  };

  return (
    <div
      draggable={draggable && !editing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/todo-id", todo.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onPointerDown={holdStart}
      onPointerUp={holdEnd}
      onPointerLeave={holdEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(true);
      }}
      className={`border-b border-line py-2.5 last:border-none ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-center gap-3">
        {draggable ? (
          <span
            className="shrink-0 select-none text-[12px] leading-none text-muted/50"
            title="Drag me to the other list"
          >
            ⠿
          </span>
        ) : null}
        <Box
          on={todo.done}
          onChange={(done) =>
            send({ action: "toggleTodo", id: todo.id, done }, (b) => ({
              ...b,
              todos: b.todos.map((t) =>
                t.id === todo.id ? { ...t, done } : t,
              ),
            }))
          }
        />
        <button
          type="button"
          title={`Category: ${todo.category ?? NONE} — tap to change`}
          aria-label="Change category"
          onClick={() => setPicking(!picking)}
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-offset-2 transition hover:ring-2 hover:ring-line"
          style={{ background: catColour(todo.category) }}
        />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename();
              if (e.key === "Escape") {
                setDraft(todo.title);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 py-1 text-[14px] outline-none focus:border-ink/30"
          />
        ) : (
          <button
            type="button"
            title="Tap to rename"
            onClick={() => {
              setDraft(todo.title);
              setEditing(true);
            }}
            className={`min-w-0 flex-1 truncate text-left text-[14px] ${todo.done ? "text-muted line-through" : ""}`}
          >
            {todo.title}
          </button>
        )}
        {todo.source === "Siri" ? (
          <span className="shrink-0 text-[11px] text-muted">🎙</span>
        ) : null}
        {todo.fixed ? (
          <span className="shrink-0 text-[11px]" title="Locked to its date">
            🔒
          </span>
        ) : null}
        <KindChip todo={todo} send={send} />
        {sent ? (
          <span
            className="shrink-0 text-[11px] text-ok"
            title="With the assistant"
          >
            🤖
          </span>
        ) : null}
        <input
          type="date"
          title={dateField === "due" ? "Due" : "Day you want to do it"}
          value={todo[dateField] ?? ""}
          onChange={(e) =>
            send(
              {
                action: "editTodo",
                id: todo.id,
                field: dateField,
                value: e.target.value || null,
              },
              (b) => ({
                ...b,
                todos: b.todos.map((t) =>
                  t.id === todo.id
                    ? { ...t, [dateField]: e.target.value || null }
                    : t,
                ),
              }),
            )
          }
          className={`w-[108px] shrink-0 rounded-lg border border-transparent bg-transparent px-1 py-1 text-right text-[12px] ${
            overdue ? "text-bad" : "text-muted"
          } hover:border-line`}
        />
        <button
          type="button"
          aria-label="Delete"
          onClick={() =>
            send({ action: "deleteTodo", id: todo.id }, (b) => ({
              ...b,
              todos: b.todos.filter((t) => t.id !== todo.id),
            }))
          }
          className="shrink-0 text-[13px] text-muted/60 hover:text-bad"
        >
          ✕
        </button>
      </div>
      {menu ? (
        <div className="flex flex-wrap items-center gap-1.5 pb-1 pl-8 pt-2">
          <button
            type="button"
            onClick={toAssistant}
            className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted transition hover:text-ink"
          >
            🤖 Hand to assistant
          </button>
          <LockButton todo={todo} send={send} onDone={() => setMenu(false)} />
          <button
            type="button"
            onClick={() => setMenu(false)}
            className="rounded-full border border-transparent px-2 py-0.5 text-[11px] text-muted/70 hover:text-ink"
          >
            cancel
          </button>
        </div>
      ) : null}
      {picking ? (
        <div className="flex flex-wrap gap-1.5 pb-1 pl-8 pt-2">
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => recategorise(c)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                todo.category === c
                  ? "border-ink text-ink"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              <span
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{ background: catColour(c) }}
              />
              {c}
            </button>
          ))}
          <button
            type="button"
            onClick={() => recategorise(null)}
            className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted transition hover:text-ink"
          >
            none
          </button>
        </div>
      ) : null}
    </div>
  );
}

const queueAgent = (title: string, due: string | null) => (b: Board) => ({
  ...b,
  agent: [
    {
      id: `tmp-${Date.now()}`,
      title,
      details: "",
      due,
      status: "Queued",
      result: "",
      url: "#",
    },
    ...b.agent,
  ],
});

/* ------------------------------------------------------------- the day */

/** A day holds three real blocks of work and three things to clear, and
 *  nothing else. The caps are the whole point of the page. */
const DEEP_CAP = 3;
const QUICK_CAP = 3;
const EMAIL_RE = /e-?mails?|inbox/i;

const DEEP_PLACEHOLDERS = [
  "The one thing",
  "Also matters today",
  "Also matters today",
];

const greeting = () => {
  const h = new Date().getHours();
  return h < 12
    ? "Good morning."
    : h < 17
      ? "Good afternoon."
      : "Good evening.";
};

const pickedOn = (t: Todo, day: string) =>
  t.plan ? t.plan === day : t.due === day;

const shiftDay = (day: string, by: number) =>
  localDay(new Date(new Date(`${day}T12:00:00`).getTime() + by * 86400000));

/** The page is normally about today, so days either side get named rather
 *  than dated. */
const dayStamp = (day: string) => {
  const name =
    day === TODAY
      ? "Today"
      : day === shiftDay(TODAY, 1)
        ? "Tomorrow"
        : day === shiftDay(TODAY, -1)
          ? "Yesterday"
          : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
            });
  return `${name} · ${pretty(day)}`;
};

const dayQuestion = (day: string) =>
  day === TODAY
    ? "What still deserves to close out today?"
    : day > TODAY
      ? "What does this day need to hold?"
      : "What that day actually held.";

/** Days in a row up to (and including) `upTo`. Today not being ticked yet
 *  doesn't break a streak — the day isn't over. */
function streakOf(
  ticks: HabitTick[],
  habitId: string,
  upTo: string = TODAY,
): number {
  const dates = new Set(
    ticks.filter((t) => t.habitId === habitId).map((t) => t.date),
  );
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const d = shiftDay(upTo, -i);
    if (!dates.has(d)) {
      if (i === 0) continue;
      break;
    }
    n++;
  }
  return n;
}

/** The longest run it's ever had, so a streak that breaks still has a target. */
function bestStreak(ticks: HabitTick[], habitId: string): number {
  const dates = [
    ...new Set(ticks.filter((t) => t.habitId === habitId).map((t) => t.date)),
  ].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of dates) {
    run = prev && shiftDay(prev, 1) === d ? run + 1 : 1;
    prev = d;
    if (run > best) best = run;
  }
  return best;
}

/** A day counts as cleared when something was picked for it and all of it
 *  got ticked. */
function dayCleared(todos: Todo[], day: string): boolean {
  const picked = todos.filter((t) => t.slot && pickedOn(t, day));
  return picked.length > 0 && picked.every((t) => t.done);
}

/** Days in a row of clearing the board, today still open not counting
 *  against it. */
function clearedStreak(todos: Todo[], upTo: string = TODAY): number {
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const d = shiftDay(upTo, -i);
    if (!dayCleared(todos, d)) {
      if (i === 0) continue;
      break;
    }
    n++;
  }
  return n;
}

/* ------------------------------------------------------------ affirmations */

/** The lines Sophie writes out by hand each day. They live as habits with
 *  Kind = Affirmation in Notion, so the daily log and streak already work. */
const affirmationsOf = (board: Board) =>
  board.habits.filter((h) => h.affirmation);

const saidAll = (board: Board, day: string) => {
  const lines = affirmationsOf(board);
  if (!lines.length) return false;
  const said = new Set(
    board.ticks.filter((t) => t.date === day).map((t) => t.habitId),
  );
  return lines.every((h) => said.has(h.id));
};

function affirmationStreak(board: Board, upTo: string = TODAY): number {
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const d = shiftDay(upTo, -i);
    if (!saidAll(board, d)) {
      if (i === 0) continue;
      break;
    }
    n++;
  }
  return n;
}

/** Writing it out is the exercise, punctuation and case aren't. */
const sameWords = (a: string, b: string) => {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9$ ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return norm(a) === norm(b);
};

/**
 * Autocomplete-style tracing: the whole line sits greyed out in place and what
 * you type lands directly on top of it, character for character, so the ghost
 * ahead of the caret shrinks as you go. The input itself is invisible.
 */
function TraceLine({
  board,
  send,
  habit,
}: {
  board: Board;
  send: Send;
  habit: Habit;
}) {
  const [text, setText] = useState("");
  const said = board.ticks.some(
    (t) => t.habitId === habit.id && t.date === TODAY,
  );
  const line = habit.name;
  // Typing over the ghost only lines up while you're still on the line.
  const onTrack = line.toLowerCase().startsWith(text.toLowerCase());
  const typed = said ? line : text;
  const ghost = said ? "" : onTrack ? line.slice(text.length) : "";

  return (
    <div className="flex items-baseline gap-3 border-b border-line/60 py-2.5 last:border-none">
      <span
        className={`shrink-0 text-[13px] ${said ? "text-accent-2" : "text-muted/40"}`}
      >
        {said ? "✓" : "›"}
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="serif pointer-events-none whitespace-pre-wrap text-[17px] italic leading-snug">
          <span className={onTrack ? "" : "text-bad"}>{typed}</span>
          <span className="text-muted/35">{ghost}</span>
        </p>
        {said ? null : (
          <input
            value={text}
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              if (sameWords(v, line))
                tickHabit(board, send, habit, TODAY, true);
            }}
            spellCheck={false}
            autoComplete="off"
            aria-label={`Write out: ${line}`}
            className="serif absolute inset-0 w-full resize-none bg-transparent text-[17px] italic leading-snug text-transparent caret-ink outline-none"
          />
        )}
      </div>
    </div>
  );
}

/** Two lines typed every morning: one you're working towards, one you already
 *  have. Both written = the day counts towards their own streak. */
function Affirmations({ board, send }: { board: Board; send: Send }) {
  const lines = affirmationsOf(board);
  const [goal, setGoal] = useState("");
  const [thanks, setThanks] = useState("");
  const [writing, setWriting] = useState(false);
  const streak = affirmationStreak(board);

  const keep = (name: string) =>
    send(
      {
        action: "addHabit",
        name,
        cadence: "Daily",
        bad: false,
        affirmation: true,
      },
      (b) => ({
        ...b,
        habits: [
          ...b.habits,
          {
            id: `tmp-${name}`,
            name,
            cadence: "Daily",
            bad: false,
            affirmation: true,
          },
        ],
      }),
    );

  if (!lines.length)
    return (
      <div className="day-card mb-5 p-6 sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Daily lines
        </p>
        <p className="mt-2 text-[14px] text-muted">
          Two sentences to write out every morning — one you&rsquo;re working
          towards, one you&rsquo;re grateful for.
        </p>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="I make $200k a month"
          className="serif mt-4 w-full border-b border-line bg-transparent py-2 text-[19px] outline-none placeholder:text-muted/40 focus:border-ink/40"
        />
        <input
          value={thanks}
          onChange={(e) => setThanks(e.target.value)}
          placeholder="I'm grateful for the life I'm building"
          className="serif mt-3 w-full border-b border-line bg-transparent py-2 text-[19px] outline-none placeholder:text-muted/40 focus:border-ink/40"
        />
        <button
          type="button"
          onClick={() => {
            keep(goal.trim() || "I make $200k a month");
            keep(thanks.trim() || "I'm grateful for the life I'm building");
            setGoal("");
            setThanks("");
          }}
          className="mt-4 rounded-full border border-line px-3 py-1.5 text-[12px] text-muted transition hover:border-ink/30 hover:text-ink"
        >
          keep these
        </button>
      </div>
    );

  return (
    <div className="card card-write px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-[13px] font-semibold">
          <span className="badge badge-bad">♡</span>
          Write them out
        </h3>
        <span className="shrink-0 text-[11px] text-muted">
          {saidAll(board, TODAY)
            ? streak > 1
              ? `Done · ${streak} days`
              : "Done today"
            : "Not done today"}
        </span>
      </div>
      {writing || saidAll(board, TODAY) ? (
        <div className="mt-1">
          {lines.map((h) => (
            <TraceLine key={h.id} board={board} send={send} habit={h} />
          ))}
        </div>
      ) : (
        <>
          <div className="serif mt-3 space-y-0.5 text-[17px] italic leading-snug">
            {lines.map((h) => (
              <p key={h.id}>{h.name}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="btn mt-3"
          >
            ✎ Write today&rsquo;s
          </button>
        </>
      )}
    </div>
  );
}

/** Every daily habit as one dot — filled once it's ticked today, with the
 *  running streak beside it. Quiet enough to live in the header. */
function StreakDots({ board }: { board: Board }) {
  const habits = board.habits.filter(
    (h) => h.cadence === "Daily" && !h.bad && !h.affirmation,
  );
  const done = new Set(
    board.ticks.filter((t) => t.date === TODAY).map((t) => t.habitId),
  );
  const cleared = clearedStreak(board.todos);
  const clearedToday = dayCleared(board.todos, TODAY);
  if (!habits.length && !cleared) return null;
  return (
    <div className="flex items-center gap-3">
      <span
        title={`Days in a row you cleared everything you picked — ${cleared} running`}
        className="flex items-center gap-1.5"
      >
        <span
          className={`h-2 w-2 rounded-full ${clearedToday ? "bg-ink" : "border border-line"}`}
        />
        <span
          className={`text-[12px] tabular-nums ${clearedToday ? "text-ink" : "text-muted"}`}
        >
          {cleared}
        </span>
      </span>
      {affirmationsOf(board).length ? (
        <span
          title={`Days in a row you wrote your lines out — ${affirmationStreak(board)} running`}
          className="flex items-center gap-1.5"
        >
          <span
            className={`h-2 w-2 rounded-full ${saidAll(board, TODAY) ? "bg-accent-2" : "border border-line"}`}
          />
          <span
            className={`text-[12px] tabular-nums ${saidAll(board, TODAY) ? "text-ink" : "text-muted"}`}
          >
            {affirmationStreak(board)}
          </span>
        </span>
      ) : null}
      {habits.length ? <span className="h-3 w-px bg-line" /> : null}
      {habits.map((h) => {
        const streak = streakOf(board.ticks, h.id);
        const on = done.has(h.id);
        return (
          <span
            key={h.id}
            title={`${h.name} — ${streak} day${streak === 1 ? "" : "s"} running, best ${bestStreak(board.ticks, h.id)}`}
            className="flex items-center gap-1.5"
          >
            <span
              className={`h-2 w-2 rounded-full ${on ? "bg-warn" : "border border-line bg-transparent"}`}
            />
            <span
              className={`text-[12px] tabular-nums ${on ? "text-ink" : "text-muted"}`}
            >
              {streak}
            </span>
          </span>
        );
      })}
    </div>
  );
}

const spell = (m: number) =>
  m >= 60 ? `${Math.round((m / 60) * 10) / 10}h` : `${m}m`;
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** What this kind of task has really taken before, so a day can be sized on
 *  history rather than hope. Matching is by shared words — "film the intro"
 *  learns from every other filming day. */
function estimateFor(timings: Timing[], title: string): number | null {
  const words = (title.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(
    (w) => !STOP_WORDS.has(w),
  );
  if (!words.length) return null;
  const hits = timings.filter((t) => {
    const other = t.title.toLowerCase();
    return words.some((w) => other.includes(w));
  });
  if (!hits.length) return null;
  return Math.round(hits.reduce((sum, h) => sum + h.minutes, 0) / hits.length);
}

const STOP_WORDS = new Set([
  "with",
  "that",
  "this",
  "from",
  "into",
  "some",
  "then",
  "them",
  "your",
  "about",
  "email",
]);

/** The stopwatch: it survives a refresh, and what it measures is added to the
 *  task's Minutes in Notion so the next estimate is better than the last. */
function Timer({ todo, send }: { todo: Todo; send: Send }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const raw = window.localStorage.getItem(`timer:${todo.id}`);
    setStartedAt(raw ? Number(raw) : null);
  }, [todo.id]);

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const start = () => {
    const at = Date.now();
    window.localStorage.setItem(`timer:${todo.id}`, String(at));
    setStartedAt(at);
    setNow(at);
  };

  const stop = () => {
    if (startedAt === null) return;
    const total =
      (todo.minutes ?? 0) +
      Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    window.localStorage.removeItem(`timer:${todo.id}`);
    setStartedAt(null);
    send(
      {
        action: "editTodo",
        id: todo.id,
        field: "minutes",
        value: String(total),
      },
      (b) => ({
        ...b,
        todos: b.todos.map((t) =>
          t.id === todo.id ? { ...t, minutes: total } : t,
        ),
      }),
    );
  };

  if (startedAt !== null)
    return (
      <button
        type="button"
        onClick={stop}
        title="Stop and save the time to Notion"
        className="shrink-0 rounded-full border border-accent-2 bg-accent-2/10 px-2.5 py-1 text-[12px] tabular-nums text-accent-2"
      >
        ■ {clock(now - startedAt)}
      </button>
    );

  return (
    <button
      type="button"
      onClick={start}
      title="Time this one"
      className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[12px] text-muted transition hover:border-ink/30 hover:text-ink"
    >
      ▶ start
    </button>
  );
}

/** Taking something off today doesn't delete it — it just stops claiming the
 *  day, which is the only way a cap of three survives contact with a week. */
function park(todo: Todo, send: Send, day: string) {
  send(
    { action: "editTodo", id: todo.id, field: "slot", value: null },
    (b) => ({
      ...b,
      todos: b.todos.map((t) => (t.id === todo.id ? { ...t, slot: null } : t)),
    }),
  );
  if (todo.plan === day)
    send(
      { action: "editTodo", id: todo.id, field: "plan", value: null },
      (b) => ({
        ...b,
        todos: b.todos.map((t) =>
          t.id === todo.id ? { ...t, plan: null } : t,
        ),
      }),
    );
}

/** Everything that ran late in one go: the day it missed is dropped and the
 *  deadline moves to the coming Monday, so the whole lot sits in the waiting
 *  pile ready to be dragged into the week instead of glaring in red. */
function rescheduleLate(late: Todo[], send: Send) {
  const monday = comingMonday();
  for (const todo of late) {
    if (isFixed(todo)) continue;
    if (todo.slot)
      send(
        { action: "editTodo", id: todo.id, field: "slot", value: null },
        (b) => ({
          ...b,
          todos: b.todos.map((t) =>
            t.id === todo.id ? { ...t, slot: null } : t,
          ),
        }),
      );
    if (todo.plan)
      send(
        { action: "editTodo", id: todo.id, field: "plan", value: null },
        (b) => ({
          ...b,
          todos: b.todos.map((t) =>
            t.id === todo.id ? { ...t, plan: null } : t,
          ),
        }),
      );
    send(
      { action: "editTodo", id: todo.id, field: "due", value: monday },
      (b) => ({
        ...b,
        todos: b.todos.map((t) =>
          t.id === todo.id ? { ...t, due: monday } : t,
        ),
      }),
    );
  }
}

/** Last week's leftovers, back on the pile in one go: the day they were
 *  promised to is dropped and a deadline already missed moves to the coming
 *  Monday. A deadline still ahead is left alone. */
function sweepWeek(leftover: Todo[], send: Send) {
  const monday = comingMonday();
  for (const todo of leftover) {
    if (isFixed(todo)) continue;
    const patch: Partial<Todo> = { slot: null, plan: null };
    if (!todo.due || todo.due < TODAY) patch.due = monday;
    for (const [field, value] of Object.entries(patch) as [
      "slot" | "plan" | "due",
      string | null,
    ][])
      send(
        { action: "editTodo", id: todo.id, field, value },
        (b) => ({
          ...b,
          todos: b.todos.map((t) =>
            t.id === todo.id ? { ...t, [field]: value } : t,
          ),
        }),
      );
  }
}

/** Pulling an existing task into today: it gets the slot and the day. */
function pick(todo: Todo, slot: "deep" | "quick", send: Send, day: string) {
  send(
    { action: "editTodo", id: todo.id, field: "slot", value: slot },
    (b) => ({
      ...b,
      todos: b.todos.map((t) => (t.id === todo.id ? { ...t, slot } : t)),
    }),
  );
  if (!pickedOn(todo, day))
    send(
      { action: "editTodo", id: todo.id, field: "plan", value: day },
      (b) => ({
        ...b,
        todos: b.todos.map((t) => (t.id === todo.id ? { ...t, plan: day } : t)),
      }),
    );
}

const newTodo = (title: string, slot: "deep" | "quick", day: string): Todo => ({
  id: `tmp-${Date.now()}`,
  title,
  done: false,
  due: null,
  plan: day,
  kind: slot === "deep" ? "deadline" : "want",
  slot,
  minutes: null,
  category: null,
  priority: null,
  link: null,
  source: "Manual",
  goal: null,
  deal: null,
  fixed: false,
  every: null,
  url: "#",
});

const daysBetween = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T12:00:00`).getTime() -
      new Date(`${from}T12:00:00`).getTime()) /
      86400000,
  );

type Suggestion = { todo: Todo; why: string; score: number };

/** What the day should probably hold, read off the dates already in Notion:
 *  late things first, then what's actually due, then what she'd already
 *  planned for the day but never slotted. Undated tasks stay out of it —
 *  they're the pile, not the plan. */
function suggestFor(board: Board, day: string): Suggestion[] {
  const rank = (t: Todo): Suggestion | null => {
    const bump = (t.priority ?? "").toLowerCase().startsWith("high")
      ? 8
      : (t.priority ?? "").toLowerCase().startsWith("med")
        ? 3
        : 0;
    if (t.due) {
      const away = daysBetween(day, t.due);
      if (away < 0) {
        const late = -away;
        return {
          todo: t,
          why: late === 1 ? "a day late" : `${late} days late`,
          score: 100 + Math.min(late, 30) + bump,
        };
      }
      if (away === 0)
        return {
          todo: t,
          why: day === TODAY ? "due today" : "due that day",
          score: 95 + bump,
        };
      if (away <= 14)
        return {
          todo: t,
          why: `due ${pretty(t.due)}`,
          score: 70 - away * 2 + bump,
        };
    }
    if (t.plan === day)
      return {
        todo: t,
        why:
          day === TODAY
            ? "you planned it for today"
            : "you planned it for that day",
        score: 80 + bump,
      };
    return null;
  };

  return board.todos
    .filter((t) => !t.done && !isCheck(t) && !(t.slot && pickedOn(t, day)))
    .map(rank)
    .filter((s): s is Suggestion => s !== null)
    .sort((a, b) => b.score - a.score);
}

/** The three the dates argue for, offered rather than imposed — and trimmed to
 *  what the hours will hold, since that's the whole point of a cap. */
function Suggested({
  board,
  send,
  day,
  room,
  free,
}: {
  board: Board;
  send: Send;
  day: string;
  room: number;
  free: number;
}) {
  const [hidden, setHidden] = useState(false);
  const [skip, setSkip] = useState(0);
  const all = suggestFor(board, day);
  if (hidden || !all.length) return null;
  const p = all[skip % all.length];
  const cost = (t: Todo) => t.minutes ?? estimateFor(board.timings, t.title);
  const m = cost(p.todo);
  const tooLong = free > 0 && m !== null && m > free;
  const ordinal = ["First", "Second", "Third"][DEEP_CAP - room] ?? "Next";

  return (
    <div className="mt-2 rounded-xl border border-dashed border-line-2 bg-panel-2/60 px-3 py-2.5">
      <div className="flex items-center gap-4">
        <span className="h-6 w-6 shrink-0 rounded-full border border-dashed border-line-2" />
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-accent/80">
            {ordinal} slot · suggested from Notion
          </p>
          <p className="flex items-baseline gap-2">
            <span className="serif truncate text-[18px]">{p.todo.title}</span>
            <span
              className={`shrink-0 text-[11px] ${p.why.includes("late") ? "text-bad" : "text-muted"}`}
            >
              {p.why}
              {m ? ` · ~${spell(m)}` : ""}
              {tooLong ? " · more than you have" : ""}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {all.length > 1 ? (
            <button
              type="button"
              onClick={() => setSkip(skip + 1)}
              className="btn btn-ghost"
            >
              Pick another
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setHidden(true)}
              className="btn btn-ghost"
            >
              Not now
            </button>
          )}
          <button
            type="button"
            onClick={() => pick(p.todo, "deep", send, day)}
            className="btn btn-accent"
          >
            Add to today
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pulling tomorrow's work into today: it keeps its slot and simply changes
 *  the day it's planned for, so tomorrow empties as today grows. */
function pullForward(todo: Todo, send: Send, day: string) {
  send({ action: "editTodo", id: todo.id, field: "plan", value: day }, (b) => ({
    ...b,
    todos: b.todos.map((t) => (t.id === todo.id ? { ...t, plan: day } : t)),
  }));
  if (!todo.slot)
    send(
      { action: "editTodo", id: todo.id, field: "slot", value: "deep" },
      (b) => ({
        ...b,
        todos: b.todos.map((t) =>
          t.id === todo.id ? { ...t, slot: "deep" } : t,
        ),
      }),
    );
}

/** The day is done. Rather than end there, offer what the next day already
 *  holds — taking one moves it, so tomorrow doesn't quietly double up. */
function NextUp({
  board,
  send,
  day,
}: {
  board: Board;
  send: Send;
  day: string;
}) {
  const next = shiftDay(day, 1);
  const picked = board.todos.filter(
    (t) => !t.done && t.slot && pickedOn(t, next),
  );
  const rest = suggestFor(board, next)
    .map((s) => s.todo)
    .filter((t) => !picked.includes(t));
  const offer = [...picked, ...rest].slice(0, 3);
  const streak = clearedStreak(board.todos, day);

  return (
    <div className="mt-4 rounded-2xl border border-line bg-panel-2 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="serif text-[20px]">Good work — that&rsquo;s the day.</h4>
        {streak > 1 ? (
          <span className="shrink-0 text-[12px] text-muted">
            {streak} days in a row
          </span>
        ) : null}
        {offer.length > 1 ? (
          <button
            type="button"
            onClick={() => offer.forEach((t) => pullForward(t, send, day))}
            className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted transition hover:text-ink"
          >
            move all {offer.length}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[13px] text-muted">
        {offer.length
          ? "If you\u2019ve got more in you, here\u2019s what\u2019s next up. Taking one moves it off tomorrow."
          : "Nothing waiting for tomorrow yet. Rest on it."}
      </p>
      <div className="mt-2">
        {offer.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pullForward(t, send, day)}
            className="flex w-full items-center gap-3 border-b border-line/60 py-2 text-left last:border-none"
          >
            <span className="shrink-0 text-[13px] text-muted">+</span>
            <span className="min-w-0 flex-1 truncate text-[14px]">
              {t.title}
            </span>
            <span className="shrink-0 text-[11px] text-muted">
              {t.due ? `due ${pretty(t.due)}` : "tomorrow"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** An empty line in the day: type a new task, or pull one out of the list you
 *  already have. */
function EmptySlot({
  board,
  send,
  slot,
  placeholder,
  dim,
  day,
}: {
  board: Board;
  send: Send;
  slot: "deep" | "quick";
  placeholder: string;
  dim?: boolean;
  day: string;
}) {
  const [draft, setDraft] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const urgent = suggestFor(board, day).map((s) => s.todo);
  const rest = board.todos.filter(
    (t) =>
      !t.done &&
      !isCheck(t) &&
      !(t.slot && pickedOn(t, day)) &&
      !urgent.includes(t),
  );
  const candidates = [...urgent, ...rest].slice(0, 40);

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    send(
      {
        action: "addTodo",
        title,
        slot,
        plan: day,
        kind: slot === "deep" ? "deadline" : "want",
      },
      (b) => ({
        ...b,
        todos: [...b.todos, newTodo(title, slot, day)],
      }),
    );
  };

  return (
    <div
      className={`group border-b border-line/60 py-3 last:border-none ${dim ? "opacity-70" : ""}`}
    >
      <div className="flex items-center gap-4">
        <span
          className={`shrink-0 border border-dashed border-line-2 ${
            slot === "deep" ? "h-6 w-6 rounded-full" : "h-[18px] w-[18px] rounded-[6px]"
          }`}
        />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={placeholder}
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint ${
            slot === "deep" ? "serif text-[20px]" : "text-[15px]"
          }`}
        />
        <button
          type="button"
          onClick={() => setBrowsing(!browsing)}
          className="btn btn-ghost row-actions shrink-0"
        >
          pick one
        </button>
      </div>
      {browsing ? (
        <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-line bg-panel-2 p-1">
          {candidates.length ? (
            candidates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setBrowsing(false);
                  pick(t, slot, send, day);
                }}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-panel"
              >
                {t.title}
                {t.due ? (
                  <span className="ml-2 text-[11px] text-muted">
                    {pretty(t.due)}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="px-2 py-1.5 text-[13px] text-muted">
              Nothing else waiting.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** One of the three deep blocks: what it is, what it usually costs, and a
 *  stopwatch for what it actually cost. */
function DeepRow({
  todo,
  board,
  send,
  day,
}: {
  todo: Todo;
  board: Board;
  send: Send;
  day: string;
}) {
  const estimate = todo.minutes ?? estimateFor(board.timings, todo.title);
  const learned = todo.minutes === null && estimate !== null;
  return (
    <div className="group border-b border-line/60 py-3 last:border-none">
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label={todo.done ? "Mark as not done" : "Mark done"}
          onClick={() =>
            send(
              { action: "toggleTodo", id: todo.id, done: !todo.done },
              (b) => ({
                ...b,
                todos: b.todos.map((t) =>
                  t.id === todo.id ? { ...t, done: !todo.done } : t,
                ),
              }),
            )
          }
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[12px] transition ${
            todo.done
              ? "border-accent bg-accent text-accent-ink"
              : "border-line-2 hover:border-muted"
          }`}
        >
          {todo.done ? "✓" : ""}
        </button>
        <span
          className={`serif min-w-0 flex-1 truncate text-[22px] ${todo.done ? "text-muted line-through" : ""}`}
        >
          {todo.title}
        </span>
        <span className="row-actions flex shrink-0 items-center gap-3">
        {estimate !== null ? (
          <span
            title={
              learned
                ? "Tasks like this usually take about this long"
                : "Time logged on this one"
            }
            className="shrink-0 rounded-full bg-panel-2 px-2.5 py-1 text-[12px] text-muted"
          >
            {learned ? "~" : ""}
            {spell(estimate)}
          </span>
        ) : null}
        <Timer todo={todo} send={send} />
        <ChaseIt todo={todo} board={board} send={send} day={day} />
        <button
          type="button"
          onClick={() => park(todo, send, day)}
          className="shrink-0 text-[12px] text-muted transition hover:text-ink"
        >
          park it
        </button>
        </span>
      </div>
    </div>
  );
}

function QuickRow({
  todo,
  board,
  send,
  locked,
  day,
}: {
  todo: Todo;
  board: Board;
  send: Send;
  locked?: boolean;
  day: string;
}) {
  return (
    <div className="group flex items-center gap-4 border-b border-line/60 py-2.5 last:border-none">
      <Box
        on={todo.done}
        onChange={(done) =>
          send({ action: "toggleTodo", id: todo.id, done }, (b) => ({
            ...b,
            todos: b.todos.map((t) => (t.id === todo.id ? { ...t, done } : t)),
          }))
        }
      />
      <span
        className={`min-w-0 flex-1 truncate text-[15px] ${todo.done ? "text-muted line-through" : ""}`}
      >
        {todo.title}
      </span>
      {locked ? (
        <span className="shrink-0 rounded-full bg-accent-2/15 px-2 py-0.5 text-[11px] text-accent-2">
          ↻ Daily
        </span>
      ) : null}
      <span className="row-actions flex shrink-0 items-center gap-3">
        <Timer todo={todo} send={send} />
        {locked ? null : (
          <ChaseIt todo={todo} board={board} send={send} day={day} />
        )}
        {locked ? null : (
          <button
            type="button"
            onClick={() => park(todo, send, day)}
            className="shrink-0 text-[12px] text-muted transition hover:text-ink"
          >
            park it
          </button>
        )}
      </span>
    </div>
  );
}

/** The working day the calendar is measured against: meetings outside it
 *  aren't what stops three tasks getting done. */
const WORK_START = 9;
const WORK_END = 18;
const EVENING_END = 22;

type DayCalendar = {
  connected: boolean;
  busy?: number;
  free?: number;
  error?: string;
};

const connectCalendarHref = () =>
  `/api/google/start?back=${encodeURIComponent(window.location.pathname + window.location.search)}`;

/** What's left of the working day once Google's had its say. Asked from the
 *  browser, because only it knows what time it is where she is. */
async function readCalendarDay(): Promise<DayCalendar | null> {
  const now = new Date();
  const at = (hour: number) => {
    const d = new Date(now);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const from = now > at(WORK_START) ? now : at(WORK_START);
  // Planning at 9pm is still planning: the day just runs to bedtime instead.
  const end = at(WORK_END) > from ? at(WORK_END) : at(EVENING_END);
  const to = end > from ? end : new Date(from.getTime() + 3600000);

  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  try {
    const res = await fetch(`/api/google/day?${params}`);
    const data = (await res.json()) as DayCalendar & {
      ok: boolean;
      configured?: boolean;
    };
    if (data.configured === false) return null;
    return data;
  } catch {
    return null;
  }
}

function Arrow({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="btn min-w-[30px] text-muted hover:text-ink"
    >
      {children}
    </button>
  );
}

/** Writes the follow-up as its own to-do on the day it should be chased. */
function addCheck(title: string, day: string, send: Send) {
  const full = `${CHECK_PREFIX}${title}`.slice(0, 120);
  send({ action: "addTodo", title: full, plan: day, kind: "want" }, (b) => ({
    ...b,
    todos: [...b.todos, { ...newTodo(full, "quick", day), slot: null }],
  }));
}

/** Offered on a task the moment it's ticked: sending the thing is done, but
 *  whether it came back is a different day's question. */
function ChaseIt({
  todo,
  board,
  send,
  day,
}: {
  todo: Todo;
  board: Board;
  send: Send;
  day: string;
}) {
  const [open, setOpen] = useState(false);
  if (!todo.done || isCheck(todo)) return null;
  if (
    board.todos.some(
      (t) => isCheck(t) && !t.done && checkLabel(t) === todo.title,
    )
  )
    return null;

  const whens = [
    { label: "tomorrow", on: shiftDay(day, 1) },
    { label: "in 3 days", on: shiftDay(day, 3) },
    { label: "next week", on: shiftDay(day, 7) },
  ];

  return open ? (
    <span className="flex shrink-0 items-center gap-1.5">
      {whens.map((w) => (
        <button
          key={w.label}
          type="button"
          onClick={() => {
            setOpen(false);
            addCheck(todo.title, w.on, send);
          }}
          className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted transition hover:border-ink/30 hover:text-ink"
        >
          {w.label}
        </button>
      ))}
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="shrink-0 text-[12px] text-muted transition hover:text-ink"
    >
      check on it
    </button>
  );
}

/** The waiting column: things you finished that somebody else still owes you
 *  an answer on, sitting on the day you said you'd chase them. */
function CheckPane({
  board,
  send,
  day,
}: {
  board: Board;
  send: Send;
  day: string;
}) {
  const [draft, setDraft] = useState("");
  const all = board.todos.filter(isCheck);
  const due = all.filter((t) => !t.done && checkDay(t) === day);
  const over =
    day === TODAY
      ? all.filter((t) => {
          const on = checkDay(t);
          return !t.done && on !== null && on < day;
        })
      : [];
  const ticked = all.filter((t) => t.done && checkDay(t) === day);

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    addCheck(title, day, send);
  };

  const tick = (t: Todo, done: boolean) =>
    send({ action: "toggleTodo", id: t.id, done }, (b) => ({
      ...b,
      todos: b.todos.map((x) => (x.id === t.id ? { ...x, done } : x)),
    }));

  const push = (t: Todo) => {
    const on = shiftDay(checkDay(t) ?? day, 1);
    send({ action: "editTodo", id: t.id, field: "plan", value: on }, (b) => ({
      ...b,
      todos: b.todos.map((x) => (x.id === t.id ? { ...x, plan: on } : x)),
    }));
  };

  const row = (t: Todo, late?: boolean) => (
    <div
      key={t.id}
      className="group flex items-center gap-3 border-b border-line/60 py-2 last:border-none"
    >
      <Box on={t.done} onChange={(done) => tick(t, done)} />
      <span
        className={`min-w-0 flex-1 text-[13px] leading-snug ${
          t.done ? "text-muted line-through" : ""
        }`}
      >
        {checkLabel(t)}
      </span>
      {late ? (
        <span className="pill-late shrink-0">
          {daysAgo(checkDay(t) as string)}
        </span>
      ) : null}
      {t.done ? null : (
        <button
          type="button"
          aria-label="Check tomorrow instead"
          onClick={() => push(t)}
          className="row-actions shrink-0 text-[11px] text-muted transition hover:text-ink"
        >
          +1d
        </button>
      )}
    </div>
  );

  return (
    <aside className="card px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2.5 text-[13px] font-semibold">
          <span className="badge badge-blue">⧗</span>
          Waiting on others
        </h3>
        <span className="text-[11px] text-muted">Did it land? Did they reply?</span>
      </div>

      {over.length ? (
        <div className="mt-2">{over.map((t) => row(t, true))}</div>
      ) : null}

      <div className="mt-1">
        {due.length ? (
          due.map((t) => row(t))
        ) : over.length ? null : (
          <p className="text-[13px] text-muted">
            Nothing to chase {day === TODAY ? "today" : "that day"}.
          </p>
        )}
      </div>

      {ticked.length ? (
        <div className="mt-2 opacity-60">{ticked.map((t) => row(t))}</div>
      ) : null}

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="Add something to check on"
        className="mt-3 w-full rounded-lg border border-line-2 bg-panel-2 px-3 py-2 text-[13px] outline-none placeholder:text-faint focus:border-muted"
      />
    </aside>
  );
}

function TodayPane({ board, send }: { board: Board; send: Send }) {
  const [day, setDay] = useState(TODAY);
  const [hours, setHours] = useState("");
  const [calendar, setCalendar] = useState<DayCalendar | null>(null);

  useEffect(() => {
    setHours(window.localStorage.getItem(`hours:${day}`) ?? "");
  }, [day]);

  // The calendar knows the day better than she does at 9am, so what's left
  // after the meetings fills the box — unless she's typed over it herself.
  useEffect(() => {
    if (day !== TODAY) {
      setCalendar(null);
      return;
    }
    let live = true;
    readCalendarDay().then((today) => {
      if (!live || !today) return;
      setCalendar(today);
      if (
        today.free !== undefined &&
        !window.localStorage.getItem(`hours:${TODAY}`)
      )
        setHours(String(Math.round((today.free / 60) * 2) / 2));
    });
    return () => {
      live = false;
    };
  }, [day]);

  const setAvailable = (v: string) => {
    setHours(v);
    window.localStorage.setItem(`hours:${day}`, v);
  };

  // The cap governs what a day may *take on*, not what it's allowed to show:
  // once the three are done, anything pulled forward still belongs here.
  const open = board.todos.filter((t) => !t.done || pickedOn(t, day));
  const deep = open.filter((t) => t.slot === "deep" && pickedOn(t, day));
  const quick = open.filter((t) => t.slot === "quick" && pickedOn(t, day));
  const emails = quick.find((t) => EMAIL_RE.test(t.title));
  const otherQuick = quick.filter((t) => t !== emails);

  // What today is really asking for, from what these tasks have cost before.
  const costed = deep
    .map((t) => t.minutes ?? estimateFor(board.timings, t.title))
    .filter((m): m is number => m !== null);
  const load = costed.reduce((sum, m) => sum + m, 0);
  const free = Number(hours) * 60;
  const overloaded = free > 0 && load > free;

  const dailyHabits = board.habits.filter(
    (h) => h.cadence === "Daily" && !h.bad && !h.affirmation,
  );
  const doneToday = new Set(
    board.ticks.filter((t) => t.date === day).map((t) => t.habitId),
  );

  // Evening is when tomorrow is still choosable; morning is too late to plan it.
  const tomorrow = shiftDay(TODAY, 1);
  const tomorrowEmpty = !board.todos.some(
    (t) => t.slot === "deep" && pickedOn(t, tomorrow),
  );
  const [evening, setEvening] = useState(false);
  useEffect(() => setEvening(new Date().getHours() >= 16), []);
  const nudge = day === TODAY && evening && tomorrowEmpty;

  // Everything picked for the day is done — the moment to offer more rather
  // than let the momentum go.
  const cleared = dayCleared(board.todos, day);

  // Locked things owed today sit above everything; unpaid ones from earlier
  // days stay on today until they're ticked.
  const locked = board.todos.filter((t) => {
    if (!isFixed(t)) return false;
    const owed = moneyDay(t) as string;
    return (
      owed === day ||
      paidFor(t, day) ||
      (day === TODAY && !t.done && owed < TODAY)
    );
  });

  const dashes = (n: number, cap: number, blue?: boolean) =>
    Array.from({ length: cap }, (_, k) => (
      <span
        key={k}
        className={`dash ${k < n ? (blue ? "dash-blue" : "dash-on") : ""}`}
      />
    ));
  const addEmails = () =>
    send(
      {
        action: "addTodo",
        title: "Go through emails",
        slot: "quick",
        plan: day,
        kind: "want",
      },
      (b) => ({
        ...b,
        todos: [...b.todos, newTodo("Go through emails", "quick", day)],
      }),
    );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Arrow label="Day before" onClick={() => setDay(shiftDay(day, -1))}>
                ‹
              </Arrow>
              <Arrow label="Day after" onClick={() => setDay(shiftDay(day, 1))}>
                ›
              </Arrow>
            </div>
            <div className="min-w-0">
              <h2 className="serif text-[28px] leading-none">
                {dayStamp(day)}
                {day === TODAY ? null : (
                  <button
                    type="button"
                    onClick={() => setDay(TODAY)}
                    className="btn btn-ghost ml-2 align-middle"
                  >
                    back to today
                  </button>
                )}
              </h2>
              <p className="mt-1 text-[12px] text-muted">{dayQuestion(day)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn flex items-center gap-2 cursor-text">
              <span className="text-muted">◷</span>
              <span>Hours free {day === TODAY ? "today" : "that day"}</span>
              <input
                value={hours}
                onChange={(e) =>
                  setAvailable(e.target.value.replace(/[^\d.]/g, ""))
                }
                placeholder="—"
                inputMode="decimal"
                className="w-8 border-l border-line-2 bg-transparent pl-2 text-center text-[12px] text-muted outline-none"
              />
            </label>
            {calendar?.connected ? (
              <span className="btn text-muted" title={calendar.error}>
                {calendar.busy !== undefined
                  ? calendar.busy > 0
                    ? `${spell(calendar.busy)} booked`
                    : "Calendar is clear"
                  : "Calendar"}
              </span>
            ) : (
              <a className="btn" href={connectCalendarHref()}>
                ▦ Pull from Google Calendar
              </a>
            )}
          </div>
        </div>

        <WeekGoals board={board} send={send} day={day} />

        {nudge ? (
          <button
            type="button"
            onClick={() => setDay(tomorrow)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-left transition hover:border-warn"
          >
            <span className="text-[14px]">
              Tomorrow is still empty. Pick its three while today is fresh.
            </span>
            <span className="shrink-0 text-[13px] text-muted">choose →</span>
          </button>
        ) : null}

        {locked.filter(isFlight).map((t) => (
          <FlightDay
            key={t.id}
            todo={t}
            checks={board.checks[t.id] ?? []}
            send={send}
          />
        ))}

        {locked.filter((t) => !isFlight(t)).length ? (
          <MoneyDue
            rows={locked.filter((t) => !isFlight(t))}
            send={send}
            day={day}
          />
        ) : null}

        <DueReminders board={board} send={send} day={day} />

        <section className="card card-deep px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2.5 text-[13px] font-semibold">
              <span className="badge badge-accent">◎</span>
              {day === TODAY ? "Today\u2019s three" : "The three"}
              <span className="text-[11px] font-normal text-muted">Deep work</span>
            </h3>
            <span className="flex items-center gap-1" title={`${deep.filter((t) => !t.done).length}/3 taken`}>
              {dashes(deep.length, DEEP_CAP)}
            </span>
          </div>

          {load > 0 ? (
            <p className={`mt-2 text-[12px] ${overloaded ? "text-bad" : "text-muted"}`}>
              {overloaded
                ? `Those three have cost about ${spell(load)} before — more than the ${spell(free)} you have. Park one.`
                : `Based on how long these took before, that's about ${spell(load)} of work.`}
            </p>
          ) : null}

          <div className="mt-2">
            {deep.map((t) => (
              <DeepRow key={t.id} todo={t} board={board} send={send} day={day} />
            ))}
            {cleared ? (
              <NextUp board={board} send={send} day={day} />
            ) : deep.length < DEEP_CAP ? (
              <Suggested
                board={board}
                send={send}
                day={day}
                room={DEEP_CAP - deep.length}
                free={Math.max(0, free - load)}
              />
            ) : null}
            {Array.from(
              { length: Math.max(0, DEEP_CAP - deep.length - (!cleared && deep.length < DEEP_CAP && suggestFor(board, day).length ? 1 : 0)) },
              (_, i) => (
                <EmptySlot
                  key={`deep-${i}`}
                  board={board}
                  send={send}
                  slot="deep"
                  day={day}
                  dim={deep.length + i > 0}
                  placeholder={
                    DEEP_PLACEHOLDERS[deep.length + i] ?? "Also matters today"
                  }
                />
              ),
            )}
          </div>
        </section>

        <section className="card card-quick px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2.5 text-[13px] font-semibold">
              <span className="badge badge-blue">⚡</span>
              Quick batch
              <span className="text-[11px] font-normal text-accent-2/80">
                Knock these out in one sitting
              </span>
            </h3>
            <span className="flex items-center gap-1">
              {dashes(quick.length, QUICK_CAP, true)}
            </span>
          </div>
          <div className="mt-2">
            {emails ? (
              <QuickRow todo={emails} board={board} send={send} locked day={day} />
            ) : (
              <button
                type="button"
                onClick={addEmails}
                className="group flex w-full items-center gap-4 border-b border-line/60 py-2.5 text-left"
              >
                <span className="h-[18px] w-[18px] shrink-0 rounded-[6px] border border-dashed border-line-2" />
                <span className="min-w-0 flex-1 text-[15px] text-muted">
                  Go through emails
                </span>
                <span className="row-actions shrink-0 text-[11px] text-muted">
                  tap to take it on
                </span>
              </button>
            )}
            {otherQuick.map((t) => (
              <QuickRow key={t.id} todo={t} board={board} send={send} day={day} />
            ))}
            {Array.from(
              { length: Math.max(0, QUICK_CAP - 1 - otherQuick.length) },
              (_, i) => (
                <EmptySlot
                  key={`quick-${i}`}
                  board={board}
                  send={send}
                  slot="quick"
                  day={day}
                  placeholder="Quick thing to clear"
                />
              ),
            )}
          </div>
        </section>

        {dailyHabits.length ? (
          <section className="card card-habits px-5 py-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2.5 text-[13px] font-semibold">
                <span className="badge badge-ok">⌁</span>
                Habits
              </h3>
              <span className="text-[11px] text-muted">
                {dailyHabits.filter((h) => doneToday.has(h.id)).length} of{" "}
                {dailyHabits.length} today
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {dailyHabits.map((h) => {
                const on = doneToday.has(h.id);
                const streak = streakOf(board.ticks, h.id, day);
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => tickHabit(board, send, h, day, !on)}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      on
                        ? "border-ok/50 bg-ok/10"
                        : "border-line-2 bg-panel/60 hover:border-muted"
                    }`}
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[12px] ${
                        on
                          ? "border-ok bg-ok text-accent-ink"
                          : "border-ok/40 text-ok/60"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {h.name}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {on
                          ? streak > 1
                            ? `Done · ${streak} days`
                            : "Done"
                          : "Not yet today"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      <div className="space-y-4">
        <EmailItems board={board} send={send} day={day} />
        <CheckPane board={board} send={send} day={day} />
        {day === TODAY ? <Affirmations board={board} send={send} /> : null}
      </div>
    </div>
  );
}

/** The next Monday, so an idea that becomes work lands on the week you plan
 *  rather than in the middle of today. */
function comingMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return localDay(d);
}

const ideaToTodo = (idea: Idea, send: Send) => {
  const plan = comingMonday();
  send(
    {
      action: "ideaToTodo",
      id: idea.id,
      title: idea.title,
      link: idea.link,
      plan,
    },
    (b) => ({
      ...b,
      todos: [
        ...b.todos,
        {
          id: `tmp-${Date.now()}`,
          title: idea.title,
          done: false,
          goal: null,
          due: null,
          plan,
          kind: "want" as const,
          slot: null,
          minutes: null,
          category: null,
          priority: null,
          link: idea.link,
          source: "Manual",
          deal: null,
          fixed: false,
          every: null,
          url: "#",
        },
      ],
    }),
  );
};

/** An idea opened up: its own title and a page to write the rest of it on,
 *  both saved back to the same Notion row. */
function IdeaPage({
  idea,
  send,
  close,
}: {
  idea: Idea;
  send: Send;
  close: () => void;
}) {
  const [title, setTitle] = useState(idea.title);
  const [notes, setNotes] = useState(idea.notes);

  const save = (fields: { title?: string; notes?: string }) => {
    if (fields.title !== undefined && fields.title.trim() === idea.title)
      return;
    if (fields.notes !== undefined && fields.notes === idea.notes) return;
    send({ action: "editIdea", id: idea.id, ...fields }, (b) => ({
      ...b,
      ideas: b.ideas.map((i) => (i.id === idea.id ? { ...i, ...fields } : i)),
    }));
  };

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={close}
          className="text-[12px] text-muted transition hover:text-ink"
        >
          ← all ideas
        </button>
        <span className="flex-1 text-right text-[11px] text-muted">
          {pretty(idea.captured)}
        </span>
        <button
          type="button"
          onClick={() => ideaToTodo(idea, send)}
          className="rounded-lg border border-line px-2 py-1 text-[12px] text-muted transition hover:border-ink/30 hover:text-ink"
        >
          → to-do
        </button>
        <button
          type="button"
          aria-label="Delete idea"
          onClick={() => {
            close();
            send({ action: "deleteIdea", id: idea.id }, (b) => ({
              ...b,
              ideas: b.ideas.filter((i) => i.id !== idea.id),
            }));
          }}
          className="text-[13px] text-muted/60 hover:text-bad"
        >
          ✕
        </button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => save({ title: title.trim() || idea.title })}
        className="mb-2 w-full bg-transparent font-serif text-[22px] outline-none"
      />
      {idea.link ? (
        <a
          href={idea.link}
          target="_blank"
          rel="noreferrer"
          className="mb-2 block text-[12px] text-accent-2 underline"
        >
          {idea.link}
        </a>
      ) : null}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => save({ notes })}
        rows={12}
        placeholder="Write it out…"
        className="w-full resize-y bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-muted/70"
      />
      <p className="text-[11px] text-muted">
        Saves to this idea in Notion when you click away.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- idea trends */

const STOPWORDS = new Set(
  (
    "a an and are as at be but by for from get go have how i if in into is it its just like make me my new not" +
    " of on one or our out so some that the their them then there they this to up us want was we what when" +
    " where which who why will with you your do does did can could should would need needs about more than" +
    " thing things stuff idea ideas post content video reel"
  ).split(" "),
);

/** Loose stemming so "detailing" and "detail" land in the same pile. */
const stem = (w: string) =>
  w.replace(/(ings|ing|ies|ed|es|s)$/, (m) => (m === "ies" ? "y" : ""));

type Trend = { term: string; ideas: Idea[] };

/**
 * What keeps coming back. Purely a word count over the idea titles — no model,
 * so it can be trusted and explained: any stem that shows up in two or more
 * separate ideas is something the brain keeps circling.
 */
function trendsOf(ideas: Idea[]): Trend[] {
  const hits = new Map<string, { label: string; ideas: Idea[] }>();
  for (const idea of ideas) {
    const seen = new Set<string>();
    for (const raw of idea.title.toLowerCase().split(/[^a-z0-9']+/)) {
      if (raw.length < 4 || STOPWORDS.has(raw)) continue;
      const key = stem(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = hits.get(key) ?? { label: raw, ideas: [] };
      entry.ideas.push(idea);
      hits.set(key, entry);
    }
  }
  return [...hits.values()]
    .filter((h) => h.ideas.length > 1)
    .sort((a, b) => b.ideas.length - a.ideas.length)
    .slice(0, 4)
    .map((h) => ({ term: h.label, ideas: h.ideas }));
}

function TrendCard({ trend, send }: { trend: Trend; send: Send }) {
  const [open, setOpen] = useState(false);
  const term = trend.term;

  const spin = (title: string) =>
    send({ action: "addTodo", title, kind: "want" }, (b) => ({
      ...b,
      todos: [
        ...b.todos,
        {
          id: `tmp-${Date.now()}`,
          title,
          done: false,
          goal: null,
          due: null,
          plan: null,
          kind: "want",
          slot: null,
          minutes: null,
          category: null,
          priority: null,
          link: null,
          source: "Manual",
          deal: null,
          fixed: false,
          every: null,
          url: "#",
        },
      ],
    }));

  return (
    <div className="border-b border-line/70 py-3 last:border-none">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-[14px]">
          <span className="font-medium capitalize">{term}</span>
          <span className="text-muted">
            {" "}
            came up in {trend.ideas.length} ideas
          </span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="shrink-0 text-[12px] text-muted transition hover:text-ink"
        >
          {open ? "hide" : "which ones"}
        </button>
      </div>
      {open ? (
        <ul className="mt-2 space-y-1">
          {trend.ideas.map((i) => (
            <li key={i.id} className="text-[13px] text-muted">
              · {i.title}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[
          `Research ${term}`,
          `Block an hour on ${term}`,
          `Decide what to do about ${term}`,
        ].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => spin(t)}
            className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted transition hover:border-ink/30 hover:text-ink"
          >
            → {t.toLowerCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

function Trends({ board, send }: { board: Board; send: Send }) {
  const trends = trendsOf(board.ideas);
  return (
    <Panel
      title="Trends"
      right={
        <span className="text-[12px] text-muted">what keeps coming back</span>
      }
    >
      {trends.length ? (
        <div>
          {trends.map((t) => (
            <TrendCard key={t.term} trend={t} send={send} />
          ))}
        </div>
      ) : (
        <p className="py-2 text-[14px] text-muted">
          Nothing repeating yet — once a subject shows up in a couple of ideas
          it lands here with something to do about it.
        </p>
      )}
    </Panel>
  );
}

function IdeasPane({ board, send }: { board: Board; send: Send }) {
  const [open, setOpen] = useState<string | null>(null);
  const opened = board.ideas.find((i) => i.id === open) ?? null;

  if (opened)
    return <IdeaPage idea={opened} send={send} close={() => setOpen(null)} />;

  return (
    <div className="space-y-5">
      <Panel
        title="Ideas"
        right={
          <span className="text-[12px] text-muted">tap one to open it</span>
        }
      >
        {board.ideas.length ? (
          <div className="flex flex-wrap gap-2 py-1">
            {board.ideas.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setOpen(i.id)}
                className="max-w-full rounded-full border border-line bg-panel-2 px-3.5 py-2 text-left text-[13px] transition hover:border-ink/30 hover:bg-panel"
              >
                <span className="block max-w-[22rem] truncate">{i.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="py-2 text-[14px] text-muted">
            Nothing yet. Say “Hey Siri, capture idea” and it lands here.
          </p>
        )}
      </Panel>
      <Trends board={board} send={send} />
    </div>
  );
}

const DEADLINE_LABEL = "📌 Deadlines";
const WANT_LABEL = "✏️ Want to do";

const KIND_FACE: Record<string, string> = { deadline: "📌", want: "✏️" };
const KIND_WORD: Record<string, string> = {
  deadline: "Deadline",
  want: "Want to do",
};

/** Deadline → want to do → unset, in one tap, straight into Notion's Kind. */
function KindChip({ todo, send }: { todo: Todo; send: Send }) {
  const next =
    todo.kind === "deadline"
      ? "want"
      : todo.kind === "want"
        ? null
        : "deadline";
  return (
    <button
      type="button"
      title={`${todo.kind ? KIND_WORD[todo.kind] : "No kind set"} — tap for ${next ? KIND_WORD[next] : "none"}`}
      onClick={() =>
        send(
          { action: "editTodo", id: todo.id, field: "kind", value: next },
          (b) => ({
            ...b,
            todos: b.todos.map((t) =>
              t.id === todo.id ? { ...t, kind: next } : t,
            ),
          }),
        )
      }
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition ${
        todo.kind
          ? "border-line"
          : "border-transparent text-muted/50 hover:border-line"
      }`}
    >
      {todo.kind ? KIND_FACE[todo.kind] : "·"}
    </button>
  );
}

/** Untagged rows still have to land somewhere: a date reads as a commitment,
 *  no date reads as an intention. */
const kindOfTodo = (t: Todo): "deadline" | "want" =>
  t.kind ?? (t.due ? "deadline" : "want");

/** A title you can correct where you read it, instead of opening Notion. */
function EditTitle({
  todo,
  send,
  onEditing,
  className,
}: {
  todo: Todo;
  send: Send;
  onEditing?: (on: boolean) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);

  const start = () => {
    setDraft(todo.title);
    setEditing(true);
    onEditing?.(true);
  };

  const stop = () => {
    setEditing(false);
    onEditing?.(false);
  };

  const save = () => {
    const value = draft.trim();
    stop();
    if (!value || value === todo.title) return;
    send({ action: "editTodo", id: todo.id, field: "title", value }, (b) => ({
      ...b,
      todos: b.todos.map((t) =>
        t.id === todo.id ? { ...t, title: value } : t,
      ),
    }));
  };

  if (editing)
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") stop();
        }}
        className="min-w-0 flex-1 rounded border border-ink/30 bg-transparent px-1 py-0.5 text-[13px] outline-none"
      />
    );

  return (
    <button
      type="button"
      onClick={start}
      title="Tap to rename"
      className={`min-w-0 flex-1 break-words text-left text-[13px] leading-snug ${className ?? ""}`}
    >
      {todo.title}
    </button>
  );
}

/** The date lives in Notion, so changing it here changes it there — but it
 *  hides behind an icon so the title keeps the room. */
function EditDue({ todo, send }: { todo: Todo; send: Send }) {
  const late = !!todo.due && todo.due < TODAY;

  return (
    <span
      className="relative shrink-0"
      title={
        todo.due ? `Due ${pretty(todo.due)} — tap to change` : "Set a date"
      }
    >
      <span
        className={`text-[11px] ${late ? "text-bad" : todo.due ? "text-muted" : "text-muted/40"}`}
      >
        📅
      </span>
      <input
        type="date"
        value={todo.due ?? ""}
        aria-label="Due date"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const value = e.target.value || null;
          send(
            { action: "editTodo", id: todo.id, field: "due", value },
            (b) => ({
              ...b,
              todos: b.todos.map((t) =>
                t.id === todo.id ? { ...t, due: value } : t,
              ),
            }),
          );
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}

/** Sends a parked item straight to a chosen day — any week, not just the
 *  one on screen — as a quick task, so the pile never has to wait for the
 *  right week to be visible. */
function PlanOn({ todo, send }: { todo: Todo; send: Send }) {
  return (
    <span
      className="relative shrink-0"
      title="Plan it for a day — pick any date"
    >
      <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-muted">
        plan →
      </span>
      <input
        type="date"
        value=""
        min={TODAY}
        aria-label="Plan it for a day"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const day = e.target.value;
          if (!day) return;
          pick(todo, "quick", send, day);
          if (!todo.due || todo.due < day)
            send(
              { action: "editTodo", id: todo.id, field: "due", value: day },
              (b) => ({
                ...b,
                todos: b.todos.map((t) =>
                  t.id === todo.id ? { ...t, due: day } : t,
                ),
              }),
            );
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}

/** One picked line inside a day of the week: enough to recognise it, and a
 *  way to put it back down. */
function PlanRow({ todo, send, day }: { todo: Todo; send: Send; day: string }) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/todo-id", todo.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group flex cursor-grab items-start gap-2.5 py-1.5 active:cursor-grabbing"
    >
      <button
        type="button"
        aria-label={todo.done ? "Mark as not done" : "Mark done"}
        onClick={() =>
          send(
            { action: "toggleTodo", id: todo.id, done: !todo.done },
            (b) => ({
              ...b,
              todos: b.todos.map((t) =>
                t.id === todo.id ? { ...t, done: !todo.done } : t,
              ),
            }),
          )
        }
        className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center text-[10px] transition ${
          todo.slot === "deep" ? "rounded-full" : "rounded-[5px]"
        } border ${
          todo.done
            ? todo.slot === "deep"
              ? "border-accent bg-accent text-accent-ink"
              : "border-accent-2 bg-accent-2 text-accent-ink"
            : "border-line-2 hover:border-muted"
        }`}
      >
        {todo.done ? "✓" : ""}
      </button>
      <EditTitle
        todo={todo}
        send={send}
        onEditing={setEditing}
        className={`text-[14px] ${todo.done ? "text-muted line-through" : ""}`}
      />
      <span className="row-actions flex shrink-0 items-center gap-1.5">
        <EditDue todo={todo} send={send} />
        <button
          type="button"
          onClick={() => park(todo, send, day)}
          title="Put it back in the backlog"
          className="text-[12px] text-muted transition hover:text-ink"
        >
          ×
        </button>
      </span>
    </div>
  );
}

/** The pile the week gets planned out of: everything real in Notion that
 *  hasn't been promised to a day yet, dragged across one at a time. */
function PlanPile({ board, send }: { board: Board; send: Send }) {
  const [q, setQ] = useState("");
  const [goal, setGoal] = useState("");
  const [over, setOver] = useState(false);
  const open = board.todos.filter(
    (t) => !t.done && !t.slot && !isFixed(t) && !isCheck(t),
  );
  const goals = board.goals.filter(
    (g) => !g.done && open.some((t) => t.goal === g.id),
  );
  const nameOf = (id: string | null) =>
    board.goals.find((g) => g.id === id)?.name ?? null;
  const waiting = open
    .filter((t) => (goal ? t.goal === goal : true))
    .filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/todo-id");
        const todo = board.todos.find((t) => t.id === id);
        if (todo && todo.slot) park(todo, send, todo.plan ?? "");
      }}
      className={`card card-quick p-3.5 transition ${over ? "border-accent-2" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2.5 text-[15px] font-semibold">
          <span className="badge badge-blue-fill">≡</span>
          {over ? "Drop it back here" : "Backlog"}
        </h3>
        <span className="text-[12px] text-accent-2">
          {waiting.length} waiting in Notion
        </span>
      </div>
      <label className="mb-2 flex items-center gap-2 rounded-lg border border-accent-2-line bg-panel/70 px-3 py-2 text-[13px]">
        <span className="text-muted">⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
        />
      </label>
      {goals.length ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {[{ id: "", name: "Everything" }, ...goals].map((g) => (
            <button
              key={g.id || "all"}
              type="button"
              onClick={() => setGoal(g.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                goal === g.id
                  ? "border-ink bg-ink text-accent-ink"
                  : "border-accent-2-line text-muted hover:text-ink"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-[min(640px,60vh)] space-y-0.5 overflow-auto">
        {waiting.length ? (
          waiting.map((t) => (
            <PileRow
              key={t.id}
              todo={t}
              send={send}
              goalName={goal ? null : nameOf(t.goal)}
            />
          ))
        ) : (
          <p className="px-2 py-3 text-[13px] text-muted">
            Nothing waiting — the backlog is empty.
          </p>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Drag a task onto a day to plan it, or back here to unplan it. On a
        phone, use plan → and ×.
      </p>
    </div>
  );
}

/** A waiting row: draggable, but its title and date are still editable. */
function PileRow({
  todo,
  send,
  goalName,
}: {
  todo: Todo;
  send: Send;
  goalName: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const held = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdEnd = () => {
    if (held.current) clearTimeout(held.current);
    held.current = null;
  };

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        holdEnd();
        e.dataTransfer.setData("text/todo-id", todo.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onPointerDown={() => {
        if (!editing) held.current = setTimeout(() => setMenu(true), 500);
      }}
      onPointerUp={holdEnd}
      onPointerLeave={holdEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(true);
      }}
      className="group cursor-grab border-b border-accent-2-line/60 px-1 py-2 text-[13px] transition last:border-0 hover:bg-panel/40 active:cursor-grabbing"
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-faint">⠿</span>
        <EditTitle todo={todo} send={send} onEditing={setEditing} />
        {goalName ? (
          <span className="shrink-0 rounded-full bg-panel-2 px-1.5 text-[10px] text-muted">
            {goalName}
          </span>
        ) : null}
        <span className="row-actions flex shrink-0 items-center gap-1.5">
          <EditDue todo={todo} send={send} />
          <PlanOn todo={todo} send={send} />
        </span>
      </div>
      {menu ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
          <LockButton todo={todo} send={send} onDone={() => setMenu(false)} />
          <button
            type="button"
            onClick={() => setMenu(false)}
            className="rounded-full border border-transparent px-2 py-0.5 text-[11px] text-muted/70 hover:text-ink"
          >
            cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Some things don't need a day, they need to be gone. */
function PlanTrash({ board, send }: { board: Board; send: Send }) {
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/todo-id");
        if (!board.todos.some((t) => t.id === id)) return;
        send({ action: "deleteTodo", id }, (b) => ({
          ...b,
          todos: b.todos.filter((t) => t.id !== id),
        }));
      }}
      className={`flex items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-[12px] transition ${
        over ? "border-bad bg-bad/10 text-bad" : "border-line-2 text-faint"
      }`}
    >
      <span className="text-[14px]">🗑</span>
      {over ? "Drop it and it's gone" : "Drag here to delete"}
    </div>
  );
}

/** Some things shouldn't be on your week at all — hand them over. */
function PlanHandoff({ board, send }: { board: Board; send: Send }) {
  const [over, setOver] = useState(false);
  const [gone, setGone] = useState<string | null>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/todo-id");
        const todo = board.todos.find((t) => t.id === id);
        if (!todo) return;
        setGone(todo.title);
        send(
          {
            action: "sendToAgent",
            title: todo.title,
            due: todo.due,
            from: todo.url,
          },
          queueAgent(todo.title, todo.due),
        );
      }}
      className={`card card-quick flex items-center gap-3 px-4 py-3 transition ${
        over ? "border-accent-2" : ""
      }`}
    >
      <span className="badge badge-blue">✦</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">Hand off to Assistant</span>
        <span className="block truncate text-[12px] text-accent-2">
          {over
            ? "Drop it and the assistant takes it"
            : gone
              ? `Handed over: ${gone}`
              : "Drop a task here"}
        </span>
      </span>
    </div>
  );
}

/** The cap is the whole point of the week view, so going past it is a
 *  decision with a price, not a silent refusal. */
function OverCap({
  warn,
  quick,
  onKeep,
  onCancel,
}: {
  warn: { todo: Todo; into: "deep" | "quick" };
  quick: number;
  onKeep: () => void;
  onCancel: () => void;
}) {
  const cost = Math.min(quick, 2);
  const line =
    warn.into === "deep"
      ? `That's deep task number ${DEEP_CAP + 1}. A deep block eats about two quick ones — keep it and you'll have to ${
          cost
            ? `drop ${cost} quick task${cost > 1 ? "s" : ""} from this day`
            : "leave no room for anything quick"
        }.`
      : `That's ${QUICK_CAP + 1} quick tasks. Past three they stop being quick — something else has to go.`;

  return (
    <div className="mb-1.5 rounded-lg border border-bad/40 bg-bad/5 p-2">
      <p className="text-[12px] text-bad">{line}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted">
        {warn.todo.title}
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={onKeep}
          className="rounded-full border border-bad/50 px-2 py-0.5 text-[11px] text-bad transition hover:bg-bad/10"
        >
          add it anyway
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted transition hover:text-ink"
        >
          leave it off
        </button>
      </div>
    </div>
  );
}

/** Money owed on a day: shown, tickable, and deliberately immovable. */
function MoneyDue({
  rows,
  send,
  day,
}: {
  rows: Todo[];
  send: Send;
  day: string;
}) {
  // A repeating one is paid by rolling it to its next date, so ticking it
  // keeps it here crossed off and brings it back next time.
  const tick = (t: Todo, paid: boolean) => {
    if (!t.every) {
      send({ action: "toggleTodo", id: t.id, done: !paid }, (b) => ({
        ...b,
        todos: b.todos.map((x) => (x.id === t.id ? { ...x, done: !paid } : x)),
      }));
      return;
    }
    const field = t.due ? "due" : "plan";
    const value = stepEvery(moneyDay(t) as string, t.every, paid ? -1 : 1);
    send({ action: "editTodo", id: t.id, field, value }, (b) => ({
      ...b,
      todos: b.todos.map((x) => (x.id === t.id ? { ...x, [field]: value } : x)),
    }));
  };

  return (
    <div className="zone-money mb-2 rounded-xl border px-3 py-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="eyebrow text-accent-2">locked · due</span>
        <span className="text-[10px] opacity-70" title="Can't be moved">
          🔒
        </span>
      </div>
      {rows.map((t) => {
        const paid = t.done || paidFor(t, day);
        return (
          <div key={t.id} className="group flex items-center gap-2 py-0.5">
            <button
              type="button"
              aria-label={paid ? "Mark as not paid" : "Mark paid"}
              onClick={() => tick(t, paid)}
              className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px] transition ${
                paid
                  ? "border-current bg-current text-brand-cream"
                  : "border-current/40 hover:border-current"
              }`}
            >
              {paid ? "✓" : ""}
            </button>
            <EditTitle
              todo={t}
              send={send}
              className={`text-[15px] font-medium ${paid ? "line-through opacity-60" : ""}`}
            />
            <span className="row-actions flex shrink-0 items-center gap-1.5">
              <EditDue todo={t} send={send} />
              <button
                type="button"
                title="Unlock — make it a movable reminder"
                aria-label="Unlock"
                onClick={() => setLocked(t, false, send)}
                className="text-[11px] opacity-70 transition hover:opacity-100"
              >
                unlock
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** One day of the week being planned: the deep blocks, the quick ones, and
 *  room to fill what's still empty — the caps are what make a week plannable
 *  instead of a wish list. */
function PlanDay({
  board,
  send,
  days,
}: {
  board: Board;
  send: Send;
  /** One day, or Saturday and Sunday together as the weekend. */
  days: string[];
}) {
  const day = days[0];
  const onDays = (t: Todo) => days.some((d) => pickedOn(t, d));
  const [open, setOpen] = useState<null | "deep" | "quick">(null);
  const [draft, setDraft] = useState("");
  const [over, setOver] = useState<null | "deep" | "quick">(null);
  const [warn, setWarn] = useState<{
    todo: Todo;
    into: "deep" | "quick";
  } | null>(null);
  const picked = board.todos.filter(
    (t) => t.slot && onDays(t) && !isFixed(t) && !isCheck(t),
  );
  const fixed = board.todos.filter(
    (t) =>
      isFixed(t) &&
      days.some((d) => moneyDay(t) === d || paidFor(t, d)),
  );
  const deep = picked.filter((t) => t.slot === "deep");
  const quick = picked.filter((t) => t.slot === "quick");
  const slot = open ?? "deep";

  const urgent = suggestFor(board, day);
  const rest = board.todos.filter(
    (t) =>
      !t.done &&
      !isFixed(t) &&
      !isCheck(t) &&
      !(t.slot && onDays(t)) &&
      !urgent.some((s) => s.todo.id === t.id),
  );
  const ranked = [...urgent.map((s) => s.todo), ...rest];
  /** The same pile the panel on the right shows — anything with a slot is
   *  already promised to a day, so it's listed apart with that day on it. */
  const candidates = ranked.filter((t) => !t.slot).slice(0, 40);
  const elsewhere = ranked.filter((t) => t.slot).slice(0, 20);

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    send(
      {
        action: "addTodo",
        title,
        slot,
        plan: day,
        kind: slot === "deep" ? "deadline" : "want",
      },
      (b) => ({
        ...b,
        todos: [...b.todos, newTodo(title, slot, day)],
      }),
    );
  };

  const room =
    (slot === "deep" ? DEEP_CAP - deep.length : QUICK_CAP - quick.length) > 0;

  /** Moving a task within the day it already sits on shouldn't count twice. */
  const wouldHold = (todo: Todo, into: "deep" | "quick") =>
    (into === "deep" ? deep : quick).filter((t) => t.id !== todo.id).length + 1;

  const place = (todo: Todo, into: "deep" | "quick") => {
    setWarn(null);
    if (wouldHold(todo, into) > (into === "deep" ? DEEP_CAP : QUICK_CAP)) {
      setWarn({ todo, into });
      return;
    }
    pick(todo, into, send, day);
  };

  /** Email is the one thing every day holds, so the slot is always drawn and
   *  only becomes a real row once she takes it on. */
  const hasEmail = quick.some((t) => EMAIL_RE.test(t.title));

  const takeEmails = () =>
    send(
      {
        action: "addTodo",
        title: "Go through emails",
        slot: "quick",
        plan: day,
        kind: "want",
      },
      (b) => ({
        ...b,
        todos: [...b.todos, newTodo("Go through emails", "quick", day)],
      }),
    );

  const drop = (e: React.DragEvent, into: "deep" | "quick") => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/todo-id");
    const todo = board.todos.find((t) => t.id === id);
    if (todo && !isFixed(todo)) place(todo, into);
  };

  /** Each half of a day is its own target, so dropping is also the choice
   *  between a real block of work and something quick. */
  const zone = (kind: "deep" | "quick", rows: Todo[]) => {
    const cap = kind === "deep" ? DEEP_CAP : QUICK_CAP;
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(kind);
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => drop(e, kind)}
        className={`rounded-xl border border-dashed px-1.5 py-1.5 transition ${
          over === kind ? "border-accent-2 bg-accent-2/10" : "border-transparent"
        }`}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className={`eyebrow ${kind === "quick" ? "text-accent-2" : ""}`}>
            {kind}
          </span>
          <span
            className="flex items-center gap-1"
            title={`${rows.length}/${cap}`}
          >
            {Array.from({ length: cap }, (_, k) => (
              <span
                key={k}
                className={`dash ${k < rows.length ? (kind === "quick" ? "dash-blue" : "dash-on") : ""}`}
              />
            ))}
            {rows.length > cap ? (
              <span className="text-[10px] text-bad">+{rows.length - cap}</span>
            ) : null}
          </span>
        </div>
        {rows.map((t) => (
          <PlanRow key={t.id} todo={t} send={send} day={day} />
        ))}
        {kind === "quick" && !hasEmail ? (
          <button
            type="button"
            onClick={takeEmails}
            className="mb-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-line-2 px-2 py-1.5 text-left text-[12px] text-faint transition hover:text-ink"
          >
            <span>↻</span>
            <span className="min-w-0 flex-1 truncate">Go through emails · daily</span>
          </button>
        ) : null}
        {!rows.length ? (
          <p className="drop-slot">Drop a {kind} task</p>
        ) : null}
      </div>
    );
  };

  const count = picked.filter((t) => !t.done).length;
  const label = days.length > 1 ? "Sat – Sun" : weekday(day).slice(0, 3);
  const numbers = days
    .map((d) => String(Number(d.slice(8, 10))))
    .join("–");
  const past = days.every((d) => d < TODAY);
  const isToday = days.includes(TODAY);

  return (
    <div
      className={`card flex flex-col p-3.5 ${
        isToday ? "border-t-2 border-t-accent" : ""
      } ${past ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between">
        <span className="flex items-center gap-2">
          <span className="eyebrow">{label}</span>
          {isToday ? <span className="pill-today">Today</span> : null}
        </span>
        <span className="text-[11px] text-muted">
          {count ? `${count} task${count === 1 ? "" : "s"}` : "Open"}
        </span>
      </div>
      <p className="serif mt-1 text-[30px] leading-none">{numbers}</p>

      <div className="mt-3 flex-1 space-y-2">
        {fixed.length ? <MoneyDue rows={fixed} send={send} day={day} /> : null}
        {zone("deep", deep)}
        <div className="border-t border-line" />
        {zone("quick", quick)}
      </div>

      {warn ? (
        <OverCap
          warn={warn}
          quick={quick.length}
          onKeep={() => {
            pick(warn.todo, warn.into, send, day);
            setWarn(null);
          }}
          onCancel={() => setWarn(null)}
        />
      ) : null}

      {open ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="seg" role="group" aria-label="Deep or quick">
              {(["deep", "quick"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={open === k}
                  onClick={() => setOpen(k)}
                >
                  {k === "deep" ? "Deep" : "Quick"}
                </button>
              ))}
            </span>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="btn btn-ghost"
            >
              close
            </button>
          </div>
          {room ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder={
                open === "deep" ? "A real block of work…" : "Something quick…"
              }
              className="w-full rounded-lg border border-line-2 bg-panel-2 px-2.5 py-1.5 text-[13px] outline-none placeholder:text-faint focus:border-muted"
            />
          ) : (
            <p className="text-[12px] text-bad">
              {open} is full for this day.
            </p>
          )}
          <div className="max-h-44 overflow-auto rounded-lg border border-line bg-panel-2 p-1">
            {candidates.length ? (
              candidates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setOpen(null);
                    place(t, open);
                  }}
                  className="block w-full truncate rounded px-2 py-1 text-left text-[13px] hover:bg-panel"
                >
                  {t.title}
                  {t.due ? (
                    <span className="ml-2 text-[11px] text-muted">
                      {pretty(t.due)}
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <p className="px-2 py-1 text-[13px] text-muted">
                Nothing waiting in the backlog.
              </p>
            )}
            {elsewhere.length ? (
              <>
                <p className="eyebrow px-2 pb-0.5 pt-2">Already on another day</p>
                {elsewhere.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setOpen(null);
                      place(t, open);
                    }}
                    className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-[13px] text-muted hover:bg-panel hover:text-ink"
                  >
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="shrink-0 text-[11px]">
                      {t.plan ? weekday(t.plan) : "planned"}
                    </span>
                  </button>
                ))}
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen("deep")}
          className="mt-3 w-full rounded-lg border border-dashed border-line-2 py-2 text-[12px] text-muted transition hover:border-muted hover:text-ink"
        >
          + Add task
        </button>
      )}
    </div>
  );
}

/** One month of a single kind of task, so a glance answers "what is actually
 *  owed this month" without the optional pile in the way. */
function MonthCal({
  kind,
  items,
  offset,
}: {
  kind: "deadline" | "want";
  items: Todo[];
  offset: number;
}) {
  const { cells } = monthGrid(offset);
  const mine = items.filter((t) => !t.done && kindOfTodo(t) === kind);
  const dayOf = (t: Todo) =>
    kind === "deadline" ? (t.due ?? t.plan) : (t.plan ?? t.due);
  return (
    <Panel
      tone={kind}
      title={kind === "deadline" ? DEADLINE_LABEL : WANT_LABEL}
      right={
        <span className="text-[12px] text-muted">{mine.length || ""}</span>
      }
    >
      <div className="grid grid-cols-7 gap-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div
            key={`${d}${i}`}
            className="pb-1 text-center text-[10px] text-muted"
          >
            {d}
          </div>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <div key={`blank-${i}`} />
          ) : (
            <div
              key={d}
              className={`min-h-[62px] rounded-lg border p-1 ${
                d === TODAY ? "border-ink/40" : "border-line/70"
              }`}
            >
              <div
                className={`mb-0.5 text-[10px] ${d === TODAY ? "font-medium text-ink" : "text-muted"}`}
              >
                {Number(d.slice(8))}
              </div>
              {mine
                .filter((t) => dayOf(t) === d)
                .slice(0, 3)
                .map((t) => (
                  <div
                    key={t.id}
                    title={t.title}
                    className="mb-0.5 truncate rounded px-1 text-[10px]"
                    style={{
                      background: `color-mix(in srgb, ${catColour(t.category)} 12%, transparent)`,
                      color: catColour(t.category),
                    }}
                  >
                    {t.title}
                  </div>
                ))}
              {mine.filter((t) => dayOf(t) === d).length > 3 ? (
                <div className="text-[9px] text-muted">
                  +{mine.filter((t) => dayOf(t) === d).length - 3}
                </div>
              ) : null}
            </div>
          ),
        )}
      </div>
    </Panel>
  );
}

/** Monday-first week, so "next week" means the week, not the next seven days. */
function planWeek(offset = 0): string[] {
  const now = new Date();
  const base = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = base - ((new Date(base).getUTCDay() + 6) % 7) * 86400000;
  return Array.from({ length: 7 }, (_, i) =>
    iso(new Date(monday + (i + offset * 7) * 86400000)),
  );
}

/**
 * The week, planned rather than listed. Everything that exists lives in
 * Notion; this page only answers "what are the few things each day holds",
 * which is the part that never happens on its own.
 */
function PlanPane({ board, send }: { board: Board; send: Send }) {
  const [week, setWeek] = useState(0);
  const [month, setMonth] = useState(0);
  const [view, setView] = useState("plan");
  const [showLate, setShowLate] = useState(false);
  const cats = categoriesOf(board);
  const days = planWeek(week);
  const pickedIn = (list: string[]) =>
    board.todos.filter((t) => t.slot && list.some((d) => pickedOn(t, d)));
  const planned = pickedIn(days);
  const empty = days.filter(
    (d) => d >= TODAY && !planned.some((t) => pickedOn(t, d)),
  ).length;
  // A task with a day of its own isn't late yet — only things nobody has
  // picked up again fall into the pile.
  const late = board.todos.filter(
    (t) =>
      !t.done &&
      !isCheck(t) &&
      t.due &&
      t.due < TODAY &&
      !(t.plan && t.plan >= TODAY),
  );
  // Sunday is when the week is decided, so that's when the page offers to.
  const sunday = new Date(`${TODAY}T12:00:00`).getDay() === 0;
  const nextEmpty = pickedIn(planWeek(week + 1)).length === 0;
  const leftover = pickedIn(planWeek(week - 1)).filter(
    (t) => !t.done && !isFixed(t) && !isCheck(t),
  );
  // Days of this week that have already gone: whatever they still hold is
  // carried into a tray instead of a greyed-out column.
  const gone = week === 0 ? days.filter((d) => d < TODAY) : [];
  const carried = pickedIn(gone).filter(
    (t) => !t.done && !isFixed(t) && !isCheck(t),
  );
  const tray = week === 0 ? [...carried, ...leftover] : [];
  const trayFrom =
    carried.length && !leftover.length
      ? gone.length === 1
        ? weekday(gone[0])
        : "earlier this week"
      : carried.length
        ? "earlier"
        : "last week";
  // Mon–Fri stand alone; Saturday and Sunday share one column.
  const weekdays = days.slice(0, 5).filter((d) => !gone.includes(d));
  const weekend = days.slice(5).filter((d) => !gone.includes(d));
  const columns: string[][] = [
    ...weekdays.map((d) => [d]),
    ...(weekend.length ? [weekend] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-4">
          <h2 className="serif text-[30px] leading-none">
            {pretty(days[0])} – {Number(days[6].slice(8, 10))}
          </h2>
          <span className="flex items-baseline gap-3 text-[13px] text-muted">
            <span>
              <span className="font-medium text-ink">
                {planned.filter((t) => !t.done).length}
              </span>{" "}
              planned
            </span>
            {late.length && week === 0 ? (
              <button
                type="button"
                onClick={() => setShowLate(!showLate)}
                className="hover:text-ink"
              >
                <span className="font-medium text-bad">{late.length}</span> late
              </button>
            ) : null}
            <span>
              <span className="font-medium text-ink">{empty}</span>{" "}
              {empty === 1 ? "day" : "days"} open
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Pills
            items={[
              { id: "plan", label: "Week" },
              { id: "calendar", label: "Calendars" },
            ]}
            value={view}
            onChange={setView}
          />
          {view === "plan" ? (
            <div className="flex gap-1.5">
              <Arrow label="Previous week" onClick={() => setWeek(week - 1)}>
                ‹
              </Arrow>
              <Arrow label="This week" onClick={() => setWeek(0)}>
                {week === 0 ? "This week" : "Back to this week"}
              </Arrow>
              <Arrow label="Next week" onClick={() => setWeek(week + 1)}>
                ›
              </Arrow>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Arrow label="Previous month" onClick={() => setMonth(month - 1)}>
                ‹
              </Arrow>
              <Arrow label="This month" onClick={() => setMonth(0)}>
                {monthGrid(month).label}
              </Arrow>
              <Arrow label="Next month" onClick={() => setMonth(month + 1)}>
                ›
              </Arrow>
            </div>
          )}
        </div>
      </div>

      {view === "plan" ? (
        <>
          {showLate && late.length && week === 0 ? (
            <div className="card card-tray px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="eyebrow text-bad">Late · {late.length}</span>
                <button
                  type="button"
                  title="Clears their day and moves their date to Monday, so you can drag them into the new week"
                  onClick={() => rescheduleLate(late, send)}
                  className="btn"
                >
                  Move them to the backlog
                </button>
              </div>
              <div className="pt-1">
                {late.map((t) => (
                  <TodoRow key={t.id} todo={t} send={send} cats={cats} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
            <WeekGoals board={board} send={send} day={days[0]} wide />
            {tray.length ? (
              <div className="card card-tray px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[14px] font-medium">
                    <span className="text-bad">◷</span>
                    {tray.length} carried over from {trayFrom}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => sweepWeek(tray, send)}
                      title="Takes them off their old day and puts them back in the backlog"
                      className="btn"
                    >
                      Back to backlog
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        tray.forEach((t) =>
                          pick(t, t.slot ?? "quick", send, TODAY),
                        )
                      }
                      className="btn btn-bad"
                    >
                      Move all to today
                    </button>
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {tray.map((t) => (
                    <span
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/todo-id", t.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="flex cursor-grab items-center gap-2 rounded-lg border border-line-2 bg-panel-2 px-2.5 py-1 text-[13px] active:cursor-grabbing"
                    >
                      <span
                        className={`eyebrow ${t.slot === "quick" ? "text-accent-2" : "text-bad"}`}
                      >
                        {t.slot ?? "task"}
                      </span>
                      <span className="max-w-[260px] truncate">{t.title}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : sunday && week === 0 && nextEmpty ? (
              <button
                type="button"
                onClick={() => setWeek(week + 1)}
                className="card card-quick px-4 py-3 text-left"
              >
                <span className="text-[13px] font-medium text-accent-2">
                  It&rsquo;s Sunday — set up next week.
                </span>
                <span className="ml-2 text-[12px] text-muted">
                  Two or three a day is a week that actually happens.
                </span>
              </button>
            ) : (
              <div className="card flex items-center px-4 py-3 text-[13px] text-muted">
                Nothing carried over — every past day is clear.
              </div>
            )}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div
              className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
              style={{
                gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
              }}
            >
              {columns.map((c) => (
                <PlanDay key={c[0]} board={board} send={send} days={c} />
              ))}
            </div>
            <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
              <PlanPile board={board} send={send} />
              <PlanHandoff board={board} send={send} />
              <PlanTrash board={board} send={send} />
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <MonthCal kind="deadline" items={board.todos} offset={month} />
          <MonthCal kind="want" items={board.todos} offset={month} />
        </div>
      )}
    </div>
  );
}

const AGENT_STATUSES = ["Queued", "Working", "Done", "Failed"];
const AGENT_TONE: Record<string, string> = {
  Queued: "text-muted",
  Working: "text-accent-2",
  Done: "text-ok",
  Failed: "text-bad",
};

function AgentRow({ task, send }: { task: AgentTask; send: Send }) {
  return (
    <div className="border-b border-line py-3 last:border-none">
      <div className="flex items-center gap-3">
        <span
          className={`w-[64px] shrink-0 text-[11px] uppercase tracking-widest ${AGENT_TONE[task.status] ?? "text-muted"}`}
        >
          {task.status}
        </span>
        <span className="min-w-0 flex-1 text-[14px]">{task.title}</span>
        <span className="shrink-0 text-[12px] text-muted">
          {pretty(task.due)}
        </span>
        {task.url !== "#" ? (
          <a
            href={task.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-[12px] text-accent-2 underline"
          >
            open
          </a>
        ) : null}
        <button
          type="button"
          aria-label="Delete"
          onClick={() =>
            send({ action: "deleteAgent", id: task.id }, (b) => ({
              ...b,
              agent: b.agent.filter((a) => a.id !== task.id),
            }))
          }
          className="shrink-0 text-[13px] text-muted/60 hover:text-bad"
        >
          ✕
        </button>
      </div>
      {task.details ? (
        <p className="mt-1 pl-[76px] text-[13px] text-muted">{task.details}</p>
      ) : null}
      {task.result ? (
        <p className="mt-1 pl-[76px] text-[13px]">
          <span className="text-muted">Bot: </span>
          {task.result}
        </p>
      ) : null}
      <div className="mt-1.5 flex gap-1 pl-[76px]">
        {AGENT_STATUSES.filter((s) => s !== task.status).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() =>
              send({ action: "agentStatus", id: task.id, status: s }, (b) => ({
                ...b,
                agent: b.agent.map((a) =>
                  a.id === task.id ? { ...a, status: s } : a,
                ),
              }))
            }
            className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted transition hover:border-ink/30 hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The hand-off list: anything here is a job for the Grok bot, which reads the
 *  same Notion database and writes its answer back into the Result column. */
function AgentPane({ board, send }: { board: Board; send: Send }) {
  const open = board.agent.filter(
    (a) => a.status !== "Done" && a.status !== "Failed",
  );
  const closed = board.agent.filter(
    (a) => a.status === "Done" || a.status === "Failed",
  );
  const dbUrl =
    board.dbs.agent !== "demo"
      ? `https://notion.so/${board.dbs.agent.replace(/-/g, "")}`
      : null;

  return (
    <div className="space-y-4">
      <Panel
        title="For the assistant"
        right={
          <span className="text-[12px] text-muted">{open.length} waiting</span>
        }
      >
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-muted">
            Anything you put here lands in the{" "}
            <span className="text-ink">Assistant Tasks</span> database in
            Notion, which your assistant reads. It writes back into Result and
            flips the status when it&apos;s done.
            {dbUrl ? (
              <>
                {" "}
                <a
                  href={dbUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-2 underline"
                >
                  Open it in Notion
                </a>
              </>
            ) : null}
          </p>
          <AddRow
            placeholder="e.g. book a car detail for Saturday morning…"
            onAdd={(title) =>
              send({ action: "sendToAgent", title }, (b) => ({
                ...b,
                agent: [
                  {
                    id: `tmp-${Date.now()}`,
                    title,
                    details: "",
                    due: null,
                    status: "Queued",
                    result: "",
                    url: "#",
                  },
                  ...b.agent,
                ],
              }))
            }
          />
          {open.length ? (
            open.map((a) => <AgentRow key={a.id} task={a} send={send} />)
          ) : (
            <p className="py-2 text-[14px] text-muted">
              Nothing with the assistant. Hit 🤖 on any to-do to hand it over.
            </p>
          )}
        </div>
      </Panel>

      {closed.length ? (
        <Panel
          title="Finished"
          right={
            <span className="text-[12px] text-muted">{closed.length}</span>
          }
        >
          <div>
            {closed.map((a) => (
              <AgentRow key={a.id} task={a} send={send} />
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function tickHabit(
  board: Board,
  send: Send,
  habit: Habit,
  date: string,
  on: boolean,
) {
  const existing = board.ticks.find(
    (t) => t.habitId === habit.id && t.date === date,
  );
  send(
    {
      action: "tickHabit",
      habitId: habit.id,
      habitName: habit.name,
      date,
      on,
      tickId: existing?.id,
    },
    (b) => ({
      ...b,
      ticks: on
        ? [
            ...b.ticks,
            { id: `tmp-${Date.now()}`, habitId: habit.id, date } as HabitTick,
          ]
        : b.ticks.filter((t) => !(t.habitId === habit.id && t.date === date)),
    }),
  );
}

function HabitsPane({ board, send }: { board: Board; send: Send }) {
  const [cadence, setCadence] = useState("Daily");
  const days = monthDays().filter((d) => d <= TODAY);
  const allDays = monthDays();
  const habits = board.habits.filter(
    (h) => !h.bad && !h.affirmation && h.cadence === cadence,
  );
  const bad = board.habits.filter((h) => h.bad);
  const isOn = (habitId: string, date: string) =>
    board.ticks.some((t) => t.habitId === habitId && t.date === date);

  const total = habits.length * days.length;
  const hits = habits.reduce(
    (n, h) => n + days.filter((d) => isOn(h.id, d)).length,
    0,
  );

  return (
    <div className="space-y-4">
      <Panel
        title="Habits"
        right={
          <span className="text-[12px] text-muted">
            {total ? Math.round((hits / total) * 100) : 0}% this month
          </span>
        }
      >
        <div className="space-y-4">
          <Pills
            items={CADENCES.map((c) => ({ id: c, label: c }))}
            value={cadence}
            onChange={setCadence}
          />

          {cadence === "Daily" ? (
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-x-[2px]">
                <thead>
                  <tr>
                    <th className="min-w-[130px] pb-1 text-left text-[11px] font-medium text-muted">
                      Habit
                    </th>
                    {allDays.map((d) => (
                      <th
                        key={d}
                        className={`pb-1 text-center text-[9px] ${d === TODAY ? "font-bold text-ink" : "text-muted"} ${
                          d > TODAY ? "opacity-40" : ""
                        }`}
                      >
                        {Number(d.slice(8))}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {habits.map((h) => (
                    <tr key={h.id}>
                      <td className="pr-2 text-[13px] whitespace-nowrap">
                        {h.name}
                      </td>
                      {allDays.map((d) => (
                        <td key={d} className="px-[1px] py-[2px]">
                          <div className="flex justify-center">
                            {d > TODAY ? (
                              <span className="block h-[22px] w-[22px] rounded-full border border-line/60 opacity-30" />
                            ) : (
                              <Tick
                                on={isOn(h.id, d)}
                                ring={d === TODAY}
                                onChange={(v) =>
                                  tickHabit(board, send, h, d, v)
                                }
                              />
                            )}
                          </div>
                        </td>
                      ))}
                      <td className="pl-2 text-right text-[11px] text-muted whitespace-nowrap">
                        {days.length
                          ? Math.round(
                              (days.filter((d) => isOn(h.id, d)).length /
                                days.length) *
                                100,
                            )
                          : 0}
                        %
                        <button
                          type="button"
                          aria-label="Delete habit"
                          onClick={() =>
                            send({ action: "deleteHabit", id: h.id }, (b) => ({
                              ...b,
                              habits: b.habits.filter((x) => x.id !== h.id),
                            }))
                          }
                          className="pl-2 hover:text-bad"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              {habits.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center gap-3 border-b border-line py-2.5 last:border-none"
                >
                  <Box
                    on={isOn(h.id, TODAY)}
                    onChange={(v) => tickHabit(board, send, h, TODAY, v)}
                  />
                  <span className="flex-1 text-[14px]">{h.name}</span>
                  <button
                    type="button"
                    aria-label="Delete habit"
                    onClick={() =>
                      send({ action: "deleteHabit", id: h.id }, (b) => ({
                        ...b,
                        habits: b.habits.filter((x) => x.id !== h.id),
                      }))
                    }
                    className="text-[13px] text-muted/60 hover:text-bad"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {habits.length === 0 ? (
            <p className="text-[14px] text-muted">
              No {cadence.toLowerCase()} habits yet.
            </p>
          ) : null}

          <AddRow
            placeholder={`New ${cadence.toLowerCase()} habit…`}
            onAdd={(name) =>
              send({ action: "addHabit", name, cadence, bad: false }, (b) => ({
                ...b,
                habits: [
                  ...b.habits,
                  { id: `tmp-${Date.now()}`, name, cadence, bad: false },
                ],
              }))
            }
          />
        </div>
      </Panel>

      <Panel
        title="Bad habits"
        right={
          <span className="text-[12px] text-muted">
            tick the days you slipped
          </span>
        }
      >
        <div className="space-y-4">
          {bad.map((h) => (
            <div key={h.id}>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[13px] font-medium text-bad">
                  {h.name}
                </span>
                <span className="text-[11px] text-muted">
                  {board.ticks.filter((t) => t.habitId === h.id).length}× this
                  month
                </span>
                <button
                  type="button"
                  aria-label="Delete"
                  onClick={() =>
                    send({ action: "deleteHabit", id: h.id }, (b) => ({
                      ...b,
                      habits: b.habits.filter((x) => x.id !== h.id),
                    }))
                  }
                  className="text-[12px] text-muted/60 hover:text-bad"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {days.map((d) => (
                  <Box
                    key={d}
                    tone="bad"
                    on={isOn(h.id, d)}
                    onChange={(v) => tickHabit(board, send, h, d, v)}
                  />
                ))}
              </div>
            </div>
          ))}
          <AddRow
            placeholder="Something you want to do less of…"
            onAdd={(name) =>
              send(
                { action: "addHabit", name, cadence: "Daily", bad: true },
                (b) => ({
                  ...b,
                  habits: [
                    ...b.habits,
                    {
                      id: `tmp-${Date.now()}`,
                      name,
                      cadence: "Daily",
                      bad: true,
                    },
                  ],
                }),
              )
            }
          />
        </div>
      </Panel>
    </div>
  );
}

const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** A quarter, three months either side of today, so a goal can be written
 *  before the quarter it belongs to starts. */
function quarterAt(shift: number): {
  period: string;
  year: number;
  first: number;
} {
  const now = new Date();
  const index = Math.floor(now.getMonth() / 3) + shift;
  const year = now.getFullYear() + Math.floor(index / 4);
  const q = ((index % 4) + 4) % 4;
  return { period: `Q${q + 1} ${year}`, year, first: q * 3 };
}

const goalActions = (goal: Goal, send: Send) => ({
  tick: (done: boolean) =>
    send({ action: "toggleGoal", id: goal.id, done }, (b) => ({
      ...b,
      goals: b.goals.map((x) => (x.id === goal.id ? { ...x, done } : x)),
    })),
  remove: () =>
    send({ action: "deleteGoal", id: goal.id }, (b) => ({
      ...b,
      goals: b.goals.filter((x) => x.id !== goal.id),
    })),
});

function GoalRow({
  goal,
  send,
  note,
}: {
  goal: Goal;
  send: Send;
  note?: ReactNode;
}) {
  const { tick, remove } = goalActions(goal, send);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Box on={goal.done} onChange={tick} />
      <span
        className={`min-w-0 flex-1 truncate text-[13px] ${goal.done ? "text-muted line-through" : ""}`}
      >
        {goal.name}
      </span>
      {note}
      <button
        type="button"
        aria-label="Delete goal"
        onClick={remove}
        className="text-[12px] text-muted/60 hover:text-bad"
      >
        ✕
      </button>
    </div>
  );
}

/** The work linked to one goal, so adding a task shows the list growing
 *  instead of a count going up. */
function GoalTasks({ tasks, send }: { tasks: Todo[]; send: Send }) {
  if (!tasks.length) return null;
  return (
    <ul className="mb-1 space-y-0.5">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t.done ? "Mark as not done" : "Mark done"}
            onClick={() =>
              send({ action: "toggleTodo", id: t.id, done: !t.done }, (b) => ({
                ...b,
                todos: b.todos.map((x) =>
                  x.id === t.id ? { ...x, done: !t.done } : x,
                ),
              }))
            }
            className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border text-[8px] transition ${
              t.done
                ? "border-ink bg-ink text-brand-cream"
                : "border-line hover:border-ink/40"
            }`}
          >
            {t.done ? "✓" : ""}
          </button>
          <span
            className={`min-w-0 flex-1 truncate text-[12px] ${t.done ? "text-muted line-through" : ""}`}
          >
            {t.title}
          </span>
          {!t.done ? (
            <span
              className={`shrink-0 text-[10px] ${t.plan || t.due ? "text-muted" : "text-accent"}`}
            >
              {t.plan
                ? pretty(t.plan)
                : t.due
                  ? `due ${pretty(t.due)}`
                  : "no day"}
            </span>
          ) : null}
          <button
            type="button"
            aria-label="Delete task"
            onClick={() =>
              send({ action: "deleteTodo", id: t.id }, (b) => ({
                ...b,
                todos: b.todos.filter((x) => x.id !== t.id),
              }))
            }
            className="shrink-0 text-[11px] text-muted/60 hover:text-bad"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A month's goals, and under each one the work that actually carries it —
 *  what's done, and what still has no day, which is what Sunday is for. */
function MonthGoals({
  board,
  send,
  period,
  quarterGoals,
}: {
  board: Board;
  send: Send;
  period: string;
  quarterGoals: Goal[];
}) {
  const [parent, setParent] = useState("");
  const goals = board.goals.filter(
    (g) => g.horizon === "month" && g.period === period,
  );
  const under = quarterGoals.find((g) => g.id === parent) ?? null;

  const addTask = (goal: Goal, title: string) =>
    send({ action: "addTodo", title, goal: goal.id, kind: "want" }, (b) => ({
      ...b,
      todos: [
        ...b.todos,
        {
          ...newTodo(title, "deep", ""),
          plan: null,
          slot: null,
          kind: "want",
          goal: goal.id,
        },
      ],
    }));

  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-medium">{period}</span>
        <span className="text-[11px] text-muted">
          {goals.filter((g) => g.done).length}/{goals.length}
        </span>
      </div>
      <div className="mb-2 space-y-2">
        {goals.map((g) => {
          const tasks = board.todos.filter((t) => t.goal === g.id);
          const done = tasks.filter((t) => t.done).length;
          const loose = tasks.filter((t) => !t.done && !t.plan).length;
          const quarter = quarterGoals.find((q) => q.id === g.parent);
          return (
            <div
              key={g.id}
              className="rounded-lg border border-line/70 px-2 py-1.5"
            >
              <GoalRow
                goal={g}
                send={send}
                note={
                  <span className="shrink-0 text-[10px] text-muted">
                    {tasks.length
                      ? `${done}/${tasks.length} done`
                      : "no tasks yet"}
                    {loose ? ` · ${loose} unplanned` : ""}
                  </span>
                }
              />
              {quarter ? (
                <p className="mb-1 pl-6 text-[10px] text-muted">
                  towards {quarter.name}
                </p>
              ) : null}
              <div className="pl-6">
                <GoalTasks tasks={tasks} send={send} />
                <AddRow
                  placeholder="A task this needs…"
                  onAdd={(title) => addTask(g, title)}
                />
              </div>
            </div>
          );
        })}
        {goals.length === 0 ? (
          <p className="text-[12px] text-muted">Nothing set for this month.</p>
        ) : null}
      </div>
      {quarterGoals.length ? (
        <select
          value={parent}
          onChange={(e) => setParent(e.target.value)}
          className="mb-1 w-full rounded-lg border border-line bg-transparent px-2 py-1 text-[12px] text-muted outline-none"
        >
          <option value="">On its own</option>
          {quarterGoals.map((g) => (
            <option key={g.id} value={g.id}>
              towards {g.name}
            </option>
          ))}
        </select>
      ) : null}
      <AddRow
        placeholder="A goal for this month…"
        onAdd={(name) =>
          send(
            {
              action: "addGoal",
              name,
              area: under?.area ?? AREAS[0],
              period,
              horizon: "month",
              parent: parent || null,
            },
            (b) => ({
              ...b,
              goals: [
                ...b.goals,
                {
                  id: `tmp-${Date.now()}`,
                  name,
                  area: under?.area ?? AREAS[0],
                  period,
                  horizon: "month" as const,
                  parent: parent || null,
                  done: false,
                },
              ],
            }),
          )
        }
      />
    </div>
  );
}

function GoalsPane({ board, send }: { board: Board; send: Send }) {
  const [shift, setShift] = useState(0);
  const { period, year, first } = quarterAt(shift);
  const months = [0, 1, 2].map((i) => monthLabel(year, first + i));
  const quarterGoals = board.goals.filter(
    (g) => g.horizon === "quarter" && g.period === period,
  );
  const strays = board.goals.filter(
    (g) => g.horizon === "month" && g.period === period,
  );

  return (
    <Panel
      title="Goals"
      right={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShift((s) => s - 1)}
            className="text-[12px] text-muted hover:text-ink"
          >
            ←
          </button>
          <span className="text-[12px] font-medium">{period}</span>
          <button
            type="button"
            onClick={() => setShift((s) => s + 1)}
            className="text-[12px] text-muted hover:text-ink"
          >
            →
          </button>
        </div>
      }
    >
      <div className="mb-3 rounded-xl border border-line bg-panel-2 p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[13px] font-semibold">The quarter</span>
          <span className="text-[11px] text-muted">two or three, no more</span>
        </div>
        <div className="mb-2">
          {quarterGoals.map((g) => (
            <GoalRow
              key={g.id}
              goal={g}
              send={send}
              note={
                <span className="shrink-0 text-[10px] text-muted">
                  {
                    board.goals.filter((m) => m.parent === g.id && m.done)
                      .length
                  }
                  /{board.goals.filter((m) => m.parent === g.id).length} months
                </span>
              }
            />
          ))}
          {quarterGoals.length === 0 ? (
            <p className="text-[12px] text-muted">
              What has to be true by the end of {period}?
            </p>
          ) : null}
        </div>
        <AddRow
          placeholder="A goal for the quarter…"
          onAdd={(name) =>
            send(
              {
                action: "addGoal",
                name,
                area: AREAS[0],
                period,
                horizon: "quarter",
                parent: null,
              },
              (b) => ({
                ...b,
                goals: [
                  ...b.goals,
                  {
                    id: `tmp-${Date.now()}`,
                    name,
                    area: AREAS[0],
                    period,
                    horizon: "quarter" as const,
                    parent: null,
                    done: false,
                  },
                ],
              }),
            )
          }
        />
        {strays.length ? (
          <div className="mt-3 border-t border-line pt-2">
            <p className="mb-1 text-[11px] text-muted">
              Written before months existed
            </p>
            {strays.map((g) => (
              <GoalRow key={g.id} goal={g} send={send} />
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {months.map((m) => (
          <MonthGoals
            key={m}
            board={board}
            send={send}
            period={m}
            quarterGoals={quarterGoals}
          />
        ))}
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------- brand deals */

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Only the making of the content: script, film, edit, delivered. Chasing and
 *  closing the deal is her manager's job, so those rows never reach this tab. */
const NOT_WORK = /passed|declined|inquiry|negotiat|prospect|contact|testing/i;

/** Her tracker has eleven production stages; the wall has four columns, so
 *  the in-between waits ("waiting on script approval") hang under the step
 *  they belong to instead of becoming a column nobody drops into. */
const LANES = [
  {
    id: "script",
    label: "Script",
    match: /script|signed/i,
    verb: "Write the script for",
  },
  { id: "film", label: "Film", match: /film|shoot/i, verb: "Film" },
  {
    id: "edit",
    label: "Edit",
    match: /edit|feedback|approval to post|post/i,
    verb: "Edit",
  },
  { id: "delivered", label: "Delivered", match: /deliver/i, verb: "Send over" },
  // Handing the work over isn't the end of it: a delivered deal sits here
  // until the money actually lands.
  { id: "paid", label: "Paid", match: /paid/i, verb: "Invoice" },
] as const;

type Lane = (typeof LANES)[number];

const PAID_LANE = LANES[LANES.length - 1];

const laneOf = (stage: string | null): Lane | null =>
  stage ? (LANES.find((l) => l.match.test(stage)) ?? null) : null;

/** Payment is its own column, and it's a checkbox in her tracker rather than
 *  a production stage, so a paid deal goes last whatever its stage says. */
const laneFor = (d: Deal): Lane | null =>
  isPaid(d) ? PAID_LANE : laneOf(d.stage);

/** Moving a card is either a stage change or the payment checkbox, and
 *  dragging one back out of Paid has to untick it again. */
function moveToLane(deal: Deal, lane: Lane, stages: string[], send: Send) {
  const editDeal = (field: "stage" | "paid" | "paidOn", value: string | null) =>
    send({ action: "editDeal", id: deal.id, field, value }, (b) => ({
      ...b,
      deals: b.deals.map((d) =>
        d.id === deal.id
          ? {
              ...d,
              ...(field === "paid"
                ? { paid: value === "on" }
                : field === "paidOn"
                  ? { paidOn: value }
                  : { stage: value }),
            }
          : d,
      ),
    }));

  if (lane.id === "paid") {
    const delivered = stageFor(LANES[3], stages);
    if (delivered && !/deliver/i.test(deal.stage ?? ""))
      editDeal("stage", delivered);
    if (!isPaid(deal)) editDeal("paid", "on");
    // Which month it counts towards depends on this date, so the drop fills
    // it in rather than leaving the earnings guessing.
    if (!deal.paidOn) editDeal("paidOn", TODAY);
    return;
  }
  if (isPaid(deal)) editDeal("paid", "off");
  const stage = stageFor(lane, stages);
  if (stage && stage !== deal.stage) editDeal("stage", stage);
}

/** Dropping on a column has to choose one of her real stage names, and the
 *  actionable one ("Need to film") beats the waiting one. */
const stageFor = (lane: Lane, stages: string[]) =>
  stages.find((s) => lane.match.test(s) && /need/i.test(s)) ??
  stages.find((s) => lane.match.test(s)) ??
  null;

const isPaid = (d: Deal) => (d.paid === null ? d.stage === "Paid" : d.paid);

/** The manager brokered it, so a fifth of the fee is theirs unless that deal
 *  was cut at another rate in Notion. */
const CUT = 0.2;
const cutOf = (d: Deal) => (d.cut ? (d.cutPct ?? CUT) : 0);
const net = (d: Deal) => Math.round((d.fee ?? 0) * (1 - cutOf(d)));
/** Earnings are counted the day the money landed; a deal marked paid with no
 *  payment date falls back to its post date so it still shows up in a month. */
const earnedOn = (d: Deal) => d.paidOn ?? d.due;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const monthName = (key: string) =>
  `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

function MoneyFlag({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange.bind(null, !on)}
      className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
        on
          ? "border-ok bg-ok text-brand-cream"
          : "border-line text-muted hover:text-ink"
      }`}
    >
      {on ? `✓ ${label}` : label}
    </button>
  );
}

/** Some deals come through the manager and some don't, so the cut is a switch
 *  on the face of the card rather than a setting buried inside it. */
function CutSwitch({
  on,
  pct,
  onChange,
}: {
  on: boolean;
  pct: number;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Manager takes a cut"
      onClick={() => onChange(!on)}
      className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] transition ${
        on
          ? "border-ink/30 bg-panel text-ink"
          : "border-line text-muted hover:text-ink"
      }`}
    >
      <span
        className={`relative inline-block h-3 w-[22px] rounded-full transition ${
          on ? "bg-ink" : "bg-muted/50"
        }`}
      >
        <span
          className={`absolute top-[2px] h-2 w-2 rounded-full bg-brand-cream transition-all ${
            on ? "left-[12px]" : "left-[2px]"
          }`}
        />
      </span>
      {on ? `manager ${pct}%` : "no manager"}
    </button>
  );
}

/** One deal, as a card on the wall. Everything you can do to it — move it a
 *  step, give it a date, put the work in your week, write the script — is on
 *  the card, because the tab is meant to answer "what am I making next". */
function DealCard({
  deal,
  lane,
  board,
  send,
  open,
  onOpen,
}: {
  deal: Deal;
  lane: Lane | null;
  board: Board;
  send: Send;
  open: boolean;
  onOpen: (id: string | null) => void;
}) {
  const [adding, setAdding] = useState("");
  const [script, setScript] = useState(deal.notes);
  const [fee, setFee] = useState(deal.fee === null ? "" : String(deal.fee));
  // A card that drags while you're in its fee box can't be typed in.
  const [typing, setTyping] = useState(false);
  const stages = board.dealStages.filter((s) => !NOT_WORK.test(s));
  const tasks = board.todos.filter((t) => t.deal === deal.id);
  const left = tasks.filter((t) => !t.done).length;
  const at = lane ? LANES.indexOf(lane) : -1;

  const edit = (
    field:
      | "brand"
      | "stage"
      | "fee"
      | "due"
      | "notes"
      | "invoiced"
      | "paid"
      | "paidOn"
      | "cut"
      | "cutPct"
      | "waiting",
    value: string | null,
  ) =>
    send({ action: "editDeal", id: deal.id, field, value }, (b) => ({
      ...b,
      deals: b.deals.map((d) =>
        d.id === deal.id
          ? {
              ...d,
              ...(field === "fee"
                ? { fee: value === null ? null : Number(value) || 0 }
                : field === "brand"
                  ? { brand: value ?? "" }
                  : field === "due"
                    ? { due: value }
                    : field === "notes"
                      ? { notes: value ?? "" }
                      : field === "invoiced"
                        ? { invoiced: value === "on" }
                        : field === "paid"
                          ? { paid: value === "on" }
                          : field === "paidOn"
                            ? { paidOn: value }
                            : field === "cut"
                              ? { cut: value === "on" }
                              : field === "cutPct"
                                ? {
                                    cutPct:
                                      value === null
                                        ? null
                                        : (Number(value) || 0) / 100,
                                  }
                                : field === "waiting"
                                  ? { waiting: value === "on" }
                                  : { stage: value }),
            }
          : d,
      ),
    }));

  const move = (by: number) => {
    const target = LANES[Math.min(LANES.length - 1, Math.max(0, at + by))];
    if (target && target.id !== lane?.id)
      moveToLane(deal, target, stages, send);
  };

  /** The whole point of the tab: the step on the wall becomes a real task in
   *  the week, linked back to the deal so the script travels with it. */
  const planIt = (day: string) => {
    const title = `${lane?.verb ?? "Work on"} ${deal.brand}`.slice(0, 120);
    // A deal deadline that has already passed would drop the new task straight
    // into the late pile, so the planned day stands on its own.
    const keptDue = deal.due && deal.due >= TODAY ? deal.due : null;
    if (tasks.some((t) => !t.done && t.title === title)) return;
    send(
      {
        action: "addTodo",
        title,
        deal: deal.id,
        kind: "deadline",
        slot: "deep",
        plan: day,
        due: keptDue,
      },
      (b) => ({
        ...b,
        todos: [
          ...b.todos,
          { ...newTodo(title, "deep", day), due: keptDue, deal: deal.id },
        ],
      }),
    );
  };

  const addTask = () => {
    const title = adding.trim();
    if (!title) return;
    setAdding("");
    send(
      { action: "addTodo", title, deal: deal.id, kind: "deadline" },
      (b) => ({
        ...b,
        todos: [
          ...b.todos,
          {
            ...newTodo(title, "deep", ""),
            plan: null,
            slot: null,
            deal: deal.id,
          },
        ],
      }),
    );
  };

  const late =
    deal.due &&
    deal.due < TODAY &&
    lane?.id !== "delivered" &&
    lane?.id !== "paid";

  return (
    <div
      draggable={!typing}
      onDragStart={(e) => e.dataTransfer.setData("text/deal", deal.id)}
      className="rounded-xl border border-line bg-panel-2 p-3 transition hover:border-ink/25"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onOpen(open ? null : deal.id)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[14px] font-medium">
            {deal.brand}
          </span>
          {deal.notes ? (
            <span className="block truncate text-[11px] text-muted">
              {deal.notes.split("\n")[0]}
            </span>
          ) : null}
        </button>
        <span className="shrink-0 text-right">
          <span className="flex items-center justify-end gap-0.5 text-[12px] text-muted">
            $
            <input
              value={fee}
              inputMode="decimal"
              aria-label="Fee"
              placeholder="fee"
              onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ""))}
              onFocus={() => setTyping(true)}
              onBlur={() => {
                setTyping(false);
                if (fee !== (deal.fee === null ? "" : String(deal.fee)))
                  edit("fee", fee.trim() === "" ? null : fee.trim());
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="w-[58px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-right outline-none transition placeholder:text-muted/60 hover:border-line focus:border-ink/40"
            />
          </span>
          {deal.fee ? (
            <span className="block pr-1 text-[10px] text-muted/80">
              {deal.cut
                ? `${money(net(deal))} yours after ${Math.round(cutOf(deal) * 100)}%`
                : `${money(deal.fee)} all yours`}
            </span>
          ) : null}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => edit("waiting", deal.waiting ? "off" : "on")}
          title="Whose move is it?"
          className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
            deal.waiting
              ? "border-line bg-panel text-muted"
              : "border-ink bg-ink text-brand-cream"
          }`}
        >
          {deal.waiting ? "⏳ waiting on them" : "🎯 my move"}
        </button>
        {deal.cut !== null ? (
          <CutSwitch
            on={deal.cut}
            pct={Math.round((deal.cutPct ?? CUT) * 100)}
            onChange={(on) => edit("cut", on ? "on" : "off")}
          />
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-1">
        <input
          type="date"
          value={deal.due ?? ""}
          aria-label="Post date"
          onChange={(e) => edit("due", e.target.value || null)}
          className={`w-[112px] rounded-full border border-line bg-transparent px-2 py-0.5 text-[10px] outline-none ${
            late ? "text-bad" : "text-muted"
          }`}
        />
        <span className="flex-1 truncate text-[10px] text-muted">
          {lane?.id === "delivered"
            ? deal.invoiced
              ? "invoiced · unpaid"
              : "not invoiced yet"
            : tasks.length
              ? `${left} to-do${left === 1 ? "" : "s"}`
              : ""}
        </span>
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={at <= 0}
          aria-label="Move a step back"
          className="rounded-full border border-line px-1.5 text-[11px] text-muted transition hover:text-ink disabled:opacity-30"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={at >= LANES.length - 1}
          aria-label="Move a step on"
          className="rounded-full border border-line px-1.5 text-[11px] text-muted transition hover:text-ink disabled:opacity-30"
        >
          ›
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-1">
            <select
              value={deal.stage ?? ""}
              aria-label="Production stage"
              onChange={(e) => edit("stage", e.target.value || null)}
              className="rounded-full border border-line bg-transparent px-2 py-0.5 text-[10px] outline-none"
            >
              <option value="">no step yet</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase()}
                </option>
              ))}
            </select>
            {deal.invoiced !== null ? (
              <MoneyFlag
                label="invoiced"
                on={deal.invoiced}
                onChange={(on) => edit("invoiced", on ? "on" : "off")}
              />
            ) : null}
            {deal.paid !== null ? (
              <MoneyFlag
                label="paid"
                on={deal.paid}
                onChange={(on) => edit("paid", on ? "on" : "off")}
              />
            ) : null}
            {/* Not every deal is brokered at the same rate, and what she keeps
                is only right if the tracker knows which. */}
            {deal.cut ? (
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={Math.round((deal.cutPct ?? CUT) * 100)}
                aria-label="Manager's share, in percent"
                onFocus={() => setTyping(true)}
                onBlur={(e) => {
                  setTyping(false);
                  const pct = e.target.value.trim();
                  if (pct !== String(Math.round((deal.cutPct ?? CUT) * 100)))
                    edit("cutPct", pct === "" ? null : pct);
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="w-[42px] rounded-full border border-line bg-transparent px-2 py-0.5 text-[10px] text-muted outline-none focus:border-ink/40"
              />
            ) : null}
            {isPaid(deal) ? (
              <input
                type="date"
                value={deal.paidOn ?? ""}
                aria-label="Day the money landed"
                onChange={(e) => edit("paidOn", e.target.value || null)}
                className="rounded-full border border-line bg-transparent px-2 py-0.5 text-[10px] text-muted outline-none"
              />
            ) : null}
            <a
              href={deal.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-[10px] text-muted hover:text-ink"
            >
              notion ↗
            </a>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
              Script / brief — stays with the deal through filming
            </label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              onBlur={() => script !== deal.notes && edit("notes", script)}
              rows={script ? 6 : 3}
              placeholder="Hook, talking points, what the brand asked for…"
              className="w-full rounded-lg border border-line bg-transparent p-2 text-[12px] leading-relaxed outline-none placeholder:text-muted/70"
            />
          </div>

          <div className="space-y-0.5">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={t.done ? "Mark as not done" : "Mark done"}
                  onClick={() =>
                    send(
                      { action: "toggleTodo", id: t.id, done: !t.done },
                      (b) => ({
                        ...b,
                        todos: b.todos.map((x) =>
                          x.id === t.id ? { ...x, done: !t.done } : x,
                        ),
                      }),
                    )
                  }
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px] transition ${
                    t.done
                      ? "border-ink bg-ink text-brand-cream"
                      : "border-line hover:border-ink/40"
                  }`}
                >
                  {t.done ? "✓" : ""}
                </button>
                <span
                  className={`min-w-0 flex-1 truncate text-[12px] ${t.done ? "text-muted line-through" : ""}`}
                >
                  {t.title}
                </span>
                <span className="shrink-0 text-[10px] text-muted">
                  {t.plan ? pretty(t.plan) : "no day"}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="+ a to-do for this deal…"
              className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-2 py-1 text-[12px] outline-none placeholder:text-muted/70"
            />
            <button
              type="button"
              onClick={() => planIt(TODAY)}
              className="rounded-full border border-ink bg-ink px-2 py-1 text-[10px] text-brand-cream transition hover:opacity-90"
            >
              do it today
            </button>
            <button
              type="button"
              onClick={() => planIt(comingMonday())}
              className="rounded-full border border-line px-2 py-1 text-[10px] text-muted transition hover:text-ink"
            >
              plan for Monday
            </button>
            <button
              type="button"
              onClick={() =>
                send({ action: "deleteDeal", id: deal.id }, (b) => ({
                  ...b,
                  deals: b.deals.filter((d) => d.id !== deal.id),
                }))
              }
              className="text-[10px] text-muted transition hover:text-bad"
            >
              remove
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Anyone who ends up with the dashboard link still doesn't get the money:
 *  the deals only come down from the server once the passcode is right. */
function DealsLock({
  tried,
  onUnlock,
}: {
  tried: boolean;
  onUnlock: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-line p-6 text-center">
      <p className="text-[22px]">🔒</p>
      <h2 className="mt-2 text-[17px] font-medium">Deals are private</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Enter your passcode to see the brand work. This device will remember it.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onUnlock(code.trim());
        }}
        className="mt-4 flex gap-2"
      >
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Passcode"
          autoFocus
          className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-[14px] outline-none placeholder:text-muted/70"
        />
        <button
          type="submit"
          className="rounded-lg border border-ink bg-ink px-3 py-2 text-[13px] text-brand-cream transition hover:opacity-90"
        >
          Unlock
        </button>
      </form>
      {tried ? (
        <p className="mt-2 text-[12px] text-bad">
          That passcode didn&apos;t work.
        </p>
      ) : null}
    </div>
  );
}

/** What she has actually been paid, month by month, net of the manager's
 *  cut — counted on the day the money landed, not the day the work shipped,
 *  so a month's number is money in the account. */
function Earnings({ deals }: { deals: Deal[] }) {
  const [all, setAll] = useState(false);
  const paid = deals.filter((d) => isPaid(d) && (d.fee ?? 0) > 0);
  const lifetime = paid.reduce((n, d) => n + net(d), 0);
  const gross = paid.reduce((n, d) => n + (d.fee ?? 0), 0);

  const byMonth = new Map<string, { net: number; deals: Deal[] }>();
  let undated = 0;
  for (const d of paid) {
    const on = earnedOn(d);
    if (!on) {
      undated += net(d);
      continue;
    }
    const key = on.slice(0, 7);
    const row = byMonth.get(key) ?? { net: 0, deals: [] };
    row.net += net(d);
    row.deals.push(d);
    byMonth.set(key, row);
  }
  const months = [...byMonth.entries()].sort((a, b) =>
    b[0].localeCompare(a[0]),
  );
  const shown = all ? months : months.slice(0, 6);
  const peak = Math.max(1, ...months.map(([, r]) => r.net));
  const thisMonth = byMonth.get(TODAY.slice(0, 7))?.net ?? 0;
  const best = months.length ? Math.max(...months.map(([, r]) => r.net)) : 0;
  const average = months.length ? Math.round(lifetime / months.length) : 0;

  const owedOut = deals
    .filter((d) => !isPaid(d) && laneFor(d)?.id === "delivered")
    .reduce((n, d) => n + net(d), 0);
  const coming = deals
    .filter((d) => !isPaid(d) && d.stage !== null && !NOT_WORK.test(d.stage))
    .reduce((n, d) => n + net(d), 0);
  // Every signed deal there has ever been, paid or not: the whole pipeline.
  const pipeline = deals
    .filter((d) => isPaid(d) || (d.stage !== null && !NOT_WORK.test(d.stage)))
    .reduce((n, d) => n + net(d), 0);

  return (
    <Panel
      title="Earnings"
      right={
        <span className="text-[12px] text-muted">
          {money(lifetime)} lifetime
          {gross > lifetime
            ? ` · ${money(gross - lifetime)} to the manager`
            : ""}
        </span>
      }
    >
      <div className="grid gap-2 sm:grid-cols-4">
        {[
          { label: "This month", value: thisMonth },
          { label: "Monthly average", value: average },
          { label: "Best month", value: best },
          { label: "Delivered, unpaid", value: owedOut, warn: true },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-line px-3 py-2"
          >
            <p className="text-[10px] uppercase tracking-wide text-muted">
              {s.label}
            </p>
            <p className={`text-[18px] ${s.warn && s.value ? "text-bad" : ""}`}>
              {money(s.value)}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[12px] text-muted">
        Everything below is what lands with you — the manager&apos;s 20% is
        already off the deals it applies to (tick &ldquo;manager 20%&rdquo; on a
        card to include it). {money(coming)} is still in production.
      </p>

      <p className="mt-1 text-[11px] text-muted/80">
        Lifetime pipeline {money(pipeline)} — every deal ever signed, paid or
        not ({money(lifetime)} in, {money(pipeline - lifetime)} still coming).
      </p>

      <div className="mt-3 space-y-1.5">
        {shown.length ? (
          shown.map(([key, row]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-[72px] shrink-0 text-[12px] text-muted">
                {monthName(key)}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-line/50">
                <span
                  className="block h-full rounded-full bg-ink/70"
                  style={{ width: `${Math.max(3, (row.net / peak) * 100)}%` }}
                />
              </span>
              <span className="w-[72px] shrink-0 text-right text-[12px]">
                {money(row.net)}
              </span>
              <span
                className="w-[150px] shrink-0 truncate text-right text-[11px] text-muted"
                title={row.deals.map((d) => d.brand).join(", ")}
              >
                {row.deals
                  .map((d) => d.brand.split(/[—–-]/)[0].trim())
                  .join(", ")}
              </span>
            </div>
          ))
        ) : (
          <p className="text-[12px] italic text-muted">
            Nothing marked paid yet — drag a delivered card to Paid and it lands
            here.
          </p>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3">
        {months.length > 6 ? (
          <button
            type="button"
            onClick={() => setAll(!all)}
            className="text-[11px] text-muted transition hover:text-ink"
          >
            {all ? "show less" : `all ${months.length} months`}
          </button>
        ) : null}
        {undated ? (
          <span className="text-[11px] text-muted">
            {money(undated)} paid with no date — give those cards a payment date
            to place them.
          </span>
        ) : null}
      </div>
    </Panel>
  );
}

/** The wall: the making of the content plus the money at the end of it,
 *  everything else about the deal left in Notion where her manager keeps it. */
function DealsPane({ board, send }: { board: Board; send: Send }) {
  const [open, setOpen] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const stages = board.dealStages.filter((s) => !NOT_WORK.test(s));
  const mine = board.deals.filter(
    (d) => d.stage !== null && !NOT_WORK.test(d.stage),
  );
  const working = mine.filter((d) => !isPaid(d));
  // Money is counted the way it arrives: after the manager's share.
  const booked = working.reduce((n, d) => n + net(d), 0);
  const cutOff = working.reduce((n, d) => n + (d.fee ?? 0), 0) - booked;
  const owed = working
    .filter((d) => laneFor(d)?.id === "delivered")
    .reduce((n, d) => n + net(d), 0);
  const loose = board.todos.filter(
    (t) =>
      !t.deal && !t.done && /brand|deal|sponsor|ugc|film|script/i.test(t.title),
  );

  const drop = (lane: Lane, id: string) => {
    setOver(null);
    const deal = board.deals.find((d) => d.id === id);
    if (deal && laneFor(deal)?.id !== lane.id)
      moveToLane(deal, lane, stages, send);
  };

  const bin = (id: string) => {
    setOver(null);
    const deal = board.deals.find((d) => d.id === id);
    if (!deal) return;
    if (!confirm(`Delete "${deal.brand}" from the tracker?`)) return;
    send({ action: "deleteDeal", id }, (b) => ({
      ...b,
      deals: b.deals.filter((d) => d.id !== id),
    }));
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Production hub"
        right={
          <span className="text-[12px] text-muted">
            {working.length} in production
            {booked ? ` · ${money(booked)} yours` : ""}
            {owed ? ` · ${money(owed)} waiting on payment` : ""}
            {cutOff ? ` (after the manager's ${money(cutOff)})` : ""}
          </span>
        }
      >
        <p className="mb-3 text-[12px] text-muted">
          Just the making-of — script, film, edit, delivered, paid. Delivered
          means the money is still out; drag it to Paid when it lands.
        </p>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {LANES.map((lane) => {
            const cards = mine
              .filter((d) => laneFor(d)?.id === lane.id)
              // Newest money first; the rest keep the tracker's own order.
              .sort((a, b) =>
                lane.id === "paid"
                  ? (earnedOn(b) ?? "").localeCompare(earnedOn(a) ?? "")
                  : 0,
              );
            return (
              <div
                key={lane.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(lane.id);
                }}
                onDragLeave={() => setOver((o) => (o === lane.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/deal");
                  if (id) drop(lane, id);
                }}
                className={`rounded-2xl border p-2 transition ${
                  over === lane.id ? "border-ink bg-ink/5" : "border-line"
                }`}
              >
                <header className="flex items-baseline justify-between px-1 pb-2">
                  <h3 className="text-[13px] font-medium">
                    {lane.label}
                    {lane.id === "delivered" && owed ? (
                      <span className="ml-1.5 text-[11px] font-normal text-bad">
                        {money(owed)} owed
                      </span>
                    ) : null}
                  </h3>
                  <span className="text-[11px] text-muted">{cards.length}</span>
                </header>
                <div
                  className={`space-y-2 ${lane.id === "paid" ? "max-h-[70vh] overflow-auto" : ""}`}
                >
                  {cards.length ? (
                    cards.map((d) => (
                      <DealCard
                        key={d.id}
                        deal={d}
                        lane={lane}
                        board={board}
                        send={send}
                        open={open === d.id}
                        onOpen={setOpen}
                      />
                    ))
                  ) : (
                    <p className="px-1 py-2 text-[11px] italic text-muted">
                      Nothing here yet.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver("bin");
          }}
          onDragLeave={() => setOver((o) => (o === "bin" ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/deal");
            if (id) bin(id);
          }}
          className={`mt-3 rounded-xl border border-dashed px-3 py-2 text-center text-[11px] transition ${
            over === "bin" ? "border-bad text-bad" : "border-line text-muted"
          }`}
        >
          🗑 drag a deal here to delete it
        </div>

        <div className="mt-3">
          <AddRow
            placeholder="New signed deal — the brand's name…"
            onAdd={(brand) =>
              send({ action: "addDeal", brand, stage: stages[0] }, (b) => ({
                ...b,
                deals: [
                  ...b.deals,
                  {
                    id: `tmp-${Date.now()}`,
                    brand,
                    stage: stages[0] ?? null,
                    status: null,
                    fee: null,
                    due: null,
                    contact: "",
                    link: null,
                    notes: "",
                    invoiced: false,
                    paid: false,
                    paidOn: null,
                    cut: true,
                    cutPct: null,
                    keep: null,
                    waiting: false,
                    url: "#",
                  },
                ],
              }))
            }
          />
        </div>
      </Panel>

      <Earnings deals={board.deals} />

      {loose.length ? (
        <Panel
          title="Content to-dos with no deal"
          right={<span className="text-[12px] text-muted">{loose.length}</span>}
        >
          <div className="space-y-1">
            {loose.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <select
                  value=""
                  aria-label="Attach to a deal"
                  onChange={(e) =>
                    e.target.value &&
                    send(
                      {
                        action: "editTodo",
                        id: t.id,
                        field: "deal",
                        value: e.target.value,
                      },
                      (b) => ({
                        ...b,
                        todos: b.todos.map((x) =>
                          x.id === t.id ? { ...x, deal: e.target.value } : x,
                        ),
                      }),
                    )
                  }
                  className="shrink-0 rounded-lg border border-line bg-transparent px-2 py-1 text-[11px] outline-none"
                >
                  <option value="">attach to…</option>
                  {working.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.brand}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- goals of week */

const mondayOf = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return shiftDay(day, -back);
};

/** The week's goals, pinned above every day and above the plan. A daily
 *  count goal shows that day's circles in Today and the whole week in Plan;
 *  sub-goals cross out one by one; one tick closes the goal for good. */
function WeekGoals({
  board,
  send,
  day,
  wide,
}: {
  board: Board;
  send: Send;
  day: string;
  wide?: boolean;
}) {
  const monday = mondayOf(day);
  const week = Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
  const goals = board.weekGoals.filter((g) => g.week === monday);
  const [text, setText] = useState("");
  const [perDay, setPerDay] = useState("");
  const [adding, setAdding] = useState(false);

  const patch = (id: string, fields: Partial<WeekGoal>) => (b: Board) => ({
    ...b,
    weekGoals: b.weekGoals.map((g) => (g.id === id ? { ...g, ...fields } : g)),
  });
  const add = () => {
    const t = text.trim();
    if (!t) return;
    const n = Math.max(0, Math.min(20, Number(perDay) || 0));
    setText("");
    setPerDay("");
    setAdding(false);
    send({ action: "addWeekGoal", title: t, week: monday, perDay: n }, (b) => ({
      ...b,
      weekGoals: [
        ...b.weekGoals,
        {
          id: `tmp-${Date.now()}`,
          title: t,
          week: monday,
          perDay: n,
          done: false,
          progress: {},
          url: "#",
        },
      ],
    }));
  };
  const setCount = (g: WeekGoal, on: string, n: number) => {
    const progress = { ...g.progress, [on]: n };
    send({ action: "weekGoalProgress", id: g.id, progress }, patch(g.id, { progress }));
  };
  const weekTotal = (g: WeekGoal) =>
    week.reduce((s, d) => s + Math.min(g.progress[d] ?? 0, g.perDay), 0);

  if (!goals.length && !adding)
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className={`card flex w-full items-center gap-3 border-dashed px-4 py-3 text-left transition hover:border-muted ${wide ? "h-full" : ""}`}
      >
        <span className="badge badge-fill">⚐</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">No goal for this week yet</span>
          {wide ? (
            <span className="block text-[12px] text-muted">
              One clear goal makes it easier to say no.
            </span>
          ) : null}
        </span>
        <span className="btn">Set a goal</span>
      </button>
    );

  return (
    <section
      className="card px-4 py-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-[13px] font-semibold">
          <span className="badge badge-fill">⚐</span>
          Goals of the week
        </h3>
        <span className="text-[12px] text-muted">
          {pretty(week[0])} – {pretty(week[6])}
        </span>
      </div>
      <ul className="mt-2 space-y-2">
        {goals.map((g) => {
          const subs = board.checks[g.id] ?? [];
          const todayN = Math.min(g.progress[day] ?? 0, g.perDay);
          const complete =
            g.done ||
            (g.perDay > 0
              ? weekTotal(g) >= g.perDay * 7
              : subs.length > 0 && subs.every((c) => c.done));
          return (
            <li key={g.id} className="rounded-xl bg-panel px-3 py-2">
              <div className="flex items-center gap-3">
                <Tick
                  on={complete}
                  onChange={(v) =>
                    send({ action: "weekGoalDone", id: g.id, done: v }, patch(g.id, { done: v }))
                  }
                />
                <span
                  className={`min-w-0 flex-1 text-[14px] ${complete ? "line-through opacity-50" : ""}`}
                >
                  {g.title}
                </span>
                {g.perDay > 0 ? (
                  <span className="shrink-0 text-[11px] text-muted">
                    {weekTotal(g)}/{g.perDay * 7} this week
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    send({ action: "deleteWeekGoal", id: g.id }, (b) => ({
                      ...b,
                      weekGoals: b.weekGoals.filter((x) => x.id !== g.id),
                    }))
                  }
                  title="Remove this goal"
                  className="shrink-0 text-[12px] text-muted/50 transition hover:text-bad"
                >
                  ×
                </button>
              </div>
              {g.perDay > 0 && !wide ? (
                <div className="mt-1.5 flex items-center gap-1.5 pl-[34px]">
                  {Array.from({ length: g.perDay }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`${g.title} ${i + 1} of ${g.perDay} on ${pretty(day)}`}
                      onClick={() => setCount(g, day, i < todayN ? i : i + 1)}
                      className={`flex h-[22px] min-w-[22px] items-center justify-center rounded-full border px-1.5 text-[11px] transition ${
                        i < todayN
                          ? "border-ok bg-ok text-brand-cream line-through"
                          : "border-line text-muted hover:border-ink/40"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <span className="ml-1 text-[11px] text-muted">
                    {todayN}/{g.perDay} today
                  </span>
                </div>
              ) : null}
              {g.perDay > 0 && wide ? (
                <div className="mt-1.5 grid grid-cols-7 gap-1 pl-[34px]">
                  {week.map((d) => {
                    const n = Math.min(g.progress[d] ?? 0, g.perDay);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setCount(g, d, n >= g.perDay ? 0 : n + 1)}
                        title={`${pretty(d)} — tap to count one more`}
                        className={`rounded-md border px-1 py-0.5 text-center text-[10px] transition ${
                          n >= g.perDay
                            ? "border-ok bg-ok text-brand-cream"
                            : n > 0
                              ? "border-ok/50 text-ink"
                              : "border-line text-muted hover:border-ink/40"
                        } ${d === TODAY ? "font-semibold" : ""}`}
                      >
                        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"][week.indexOf(d)]}{" "}
                        {n}/{g.perDay}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <SubGoals goal={g} subs={subs} send={send} />
            </li>
          );
        })}
      </ul>
      {adding ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="goal for the week, e.g. post 3 videos a day"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[13px] outline-none focus:border-ink/40"
          />
          <input
            value={perDay}
            onChange={(e) => setPerDay(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && add()}
            inputMode="numeric"
            placeholder="× a day"
            title="How many times a day, if it's a daily count (leave blank for a one-off)"
            className="w-[64px] rounded-lg border border-line bg-panel px-2 py-1.5 text-[13px] outline-none focus:border-ink/40"
          />
          <button
            type="button"
            onClick={add}
            className="btn btn-accent"
          >
            add
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 text-[12px] text-muted transition hover:text-ink"
        >
          + another goal
        </button>
      )}
    </section>
  );
}

/** The crossing-out part: sub-goals under a week goal, kept as to-do blocks
 *  on the goal's Notion page. */
function SubGoals({
  goal,
  subs,
  send,
}: {
  goal: WeekGoal;
  subs: Check[];
  send: Send;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const add = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    send({ action: "addCheck", page: goal.id, text: t }, (b) => ({
      ...b,
      checks: {
        ...b.checks,
        [goal.id]: [
          ...(b.checks[goal.id] ?? []),
          { id: `tmp-${Date.now()}`, text: t, done: false },
        ],
      },
    }));
  };
  if (!subs.length && !open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 pl-[34px] text-[11px] text-muted/70 transition hover:text-ink"
      >
        + sub-goals
      </button>
    );
  return (
    <ul className="mt-1.5 space-y-1 pl-[34px]">
      {subs.map((c) => (
        <li key={c.id} className="flex items-center gap-2">
          <Box
            on={c.done}
            onChange={(v) =>
              send({ action: "tickCheck", id: c.id, done: v }, (b) => ({
                ...b,
                checks: {
                  ...b.checks,
                  [goal.id]: (b.checks[goal.id] ?? []).map((x) =>
                    x.id === c.id ? { ...x, done: v } : x,
                  ),
                },
              }))
            }
          />
          <span className={`text-[13px] ${c.done ? "line-through opacity-50" : ""}`}>
            {c.text}
          </span>
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span className="h-[18px] w-[18px] shrink-0 rounded-[6px] border border-dashed border-line" />
        <input
          value={text}
          autoFocus={open && !subs.length}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="add a sub-goal"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/50"
        />
      </li>
    </ul>
  );
}

/* ------------------------------------------------------------- flight day */

const isFlight = (t: Todo) => /✈|flight\s*day/i.test(t.title);

/** The day you fly: one card at the top of Today with everything that has to
 *  happen before you leave. The list lives as to-do blocks on the task's own
 *  Notion page, so it can be edited there too. */
function FlightDay({
  todo,
  checks,
  send,
}: {
  todo: Todo;
  checks: Check[];
  send: Send;
}) {
  const [text, setText] = useState("");
  const done = checks.filter((c) => c.done).length;
  const allDone = checks.length > 0 && done === checks.length;

  const tick = (c: Check, on: boolean) =>
    send({ action: "tickCheck", id: c.id, done: on }, (b) => ({
      ...b,
      checks: {
        ...b.checks,
        [todo.id]: (b.checks[todo.id] ?? []).map((x) =>
          x.id === c.id ? { ...x, done: on } : x,
        ),
      },
    }));
  const add = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    send({ action: "addCheck", page: todo.id, text: t }, (b) => ({
      ...b,
      checks: {
        ...b.checks,
        [todo.id]: [
          ...(b.checks[todo.id] ?? []),
          { id: `tmp-${Date.now()}`, text: t, done: false },
        ],
      },
    }));
  };

  return (
    <section className="mt-6 overflow-hidden rounded-2xl bg-accent-2 text-brand-cream">
      <div className="flex items-center justify-between px-4 pt-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <span aria-hidden className="text-[18px]">
            ✈️
          </span>
          {todo.title.replace(/✈️?\s*/, "").trim() || "Flight day"}
        </h3>
        <span className="text-[12px] text-brand-cream/80">
          {allDone ? "ready to fly" : `${done}/${checks.length} done`}
        </span>
      </div>
      <p className="px-4 pt-0.5 text-[12px] text-brand-cream/70">
        Before you leave — tick as you go. Add your own below; it saves to the
        task&rsquo;s page in Notion.
      </p>
      <div className="mt-2 h-1 w-full bg-black/10">
        <div
          className="h-1 bg-brand-cream transition-all"
          style={{ width: `${checks.length ? (done / checks.length) * 100 : 0}%` }}
        />
      </div>
      <ul className="px-4 py-2">
        {checks.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-1.5">
            <button
              type="button"
              aria-pressed={c.done}
              onClick={() => tick(c, !c.done)}
              className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border text-[11px] transition ${
                c.done
                  ? "border-brand-cream bg-brand-cream text-accent-2"
                  : "border-brand-cream/60 text-transparent hover:border-brand-cream"
              }`}
            >
              ✓
            </button>
            <span
              className={`text-[14px] ${c.done ? "line-through opacity-50" : ""}`}
            >
              {c.text}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-3 py-1.5">
          <span className="h-[20px] w-[20px] shrink-0 rounded-full border border-dashed border-brand-cream/40" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="add something to do before you fly"
            className="w-full bg-transparent text-[14px] text-brand-cream placeholder:text-brand-cream/40 outline-none"
          />
        </li>
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------ email items */

/** What the inbox bot found for the day. Each line can be ticked off on the
 *  spot, given the day it really has to happen, or promoted into a quick or
 *  deep task — at which point it leaves this list and becomes a real to-do. */
function EmailItems({
  board,
  send,
  day,
}: {
  board: Board;
  send: Send;
  day: string;
}) {
  const [slotFor, setSlotFor] = useState<Record<string, "deep" | "quick">>({});
  if (!board.dbs.emails && board.dbs.task !== "demo") return null;
  const items = board.emails.filter((e) => {
    if (e.done) return false;
    const on = e.date ?? e.created;
    return day >= TODAY ? on <= day : on === day;
  });
  if (!items.length) return null;

  const patch = (id: string, fields: Partial<EmailItem>) => (b: Board) => ({
    ...b,
    emails: b.emails.map((x) => (x.id === id ? { ...x, ...fields } : x)),
  });
  const setDate = (e: EmailItem, date: string | null) => {
    send({ action: "emailDate", id: e.id, date }, patch(e.id, { date }));
  };
  const promote = (e: EmailItem, slot: "deep" | "quick") => {
    const due = e.date ?? day;
    send(
      { action: "emailToTodo", id: e.id, title: e.title, due, plan: day, slot },
      (b) => ({
        ...patch(e.id, { done: true })(b),
        todos: [...b.todos, { ...newTodo(e.title, slot, day), due, source: "Email" }],
      }),
    );
  };

  return (
    <section className="card card-inbox px-4 py-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-[13px] font-semibold">
          <span className="badge badge-bad">✉</span>
          From your inbox
        </h3>
        <span className="pill-late">
          {items.length === 1 ? "1 new" : `${items.length} new`}
        </span>
      </div>
      <div className="mt-1">
        {items.map((e) => {
          const slot = slotFor[e.id] ?? "quick";
          return (
            <div
              key={e.id}
              className="group border-b border-line/60 py-3 last:border-0"
            >
              <div className="flex items-start gap-3">
                <div className="pt-1">
                  <Tick
                    on={false}
                    onChange={(done) =>
                      send({ action: "emailDone", id: e.id, done }, patch(e.id, { done }))
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-bad/90">
                    {[e.from, e.date ? dueLabel(e.date) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium leading-snug">
                    {e.title}
                  </p>
                  {e.notes ? (
                    <p className="mt-0.5 text-[12px] leading-snug text-muted">
                      {e.notes}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[34px]">
                <span className="seg" role="group" aria-label="Deep or quick">
                  <button
                    type="button"
                    aria-pressed={slot === "deep"}
                    onClick={() => setSlotFor({ ...slotFor, [e.id]: "deep" })}
                  >
                    Deep
                  </button>
                  <button
                    type="button"
                    aria-pressed={slot === "quick"}
                    onClick={() => setSlotFor({ ...slotFor, [e.id]: "quick" })}
                  >
                    Quick
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => promote(e, slot)}
                  title={`Make it one of the day's ${slot} tasks`}
                  className="btn btn-accent"
                >
                  Add to today
                </button>
                <button
                  type="button"
                  onClick={() => setDate(e, shiftDay(e.date ?? day, 1))}
                  className="btn"
                >
                  {e.date ? "+1 day" : "Tomorrow"}
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between pl-[34px] text-[12px]">
                <label
                  className={`flex cursor-pointer items-center gap-1.5 ${e.date && e.date < TODAY ? "text-bad" : "text-muted hover:text-ink"}`}
                >
                  <span>{e.date ? `Due ${dueLabel(e.date)}` : "Pick date"}</span>
                  <input
                    type="date"
                    value={e.date ?? ""}
                    aria-label="Day this has to be done by"
                    onChange={(ev) => setDate(e, ev.target.value || null)}
                    className="w-[18px] cursor-pointer rounded border border-line-2 bg-transparent px-0.5 py-0.5 text-[12px] text-transparent outline-none sm:w-auto sm:text-muted"
                  />
                </label>
                {e.link ? (
                  <a
                    href={e.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted transition hover:text-ink"
                  >
                    Open email ↗
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- reminders */

const shiftDays = (from: Date, days: number) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
};

/** "5 business days" is the phrase refunds, banks and support tickets are
 *  always promised in, so weekends don't count towards it. */
function shiftBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** The next time that weekday comes round, never today. */
function nextWeekday(from: Date, target: number) {
  const ahead = (target - from.getDay() + 7) % 7 || 7;
  return shiftDays(from, ahead);
}

/**
 * A reminder is typed the way it's thought — "check the Crate & Barrel refund
 * in 5 business days" — so the date is read out of the sentence and the phrase
 * is taken back out of the title.
 */
function parseWhen(text: string): { title: string; due: string | null } {
  const now = new Date();
  const patterns: {
    re: RegExp;
    date: (m: RegExpMatchArray) => Date;
  }[] = [
    {
      re: /\b(?:in|after)\s+(\d+)\s+(?:business|working|work)\s+days?\b/i,
      date: (m) => shiftBusinessDays(now, Number(m[1])),
    },
    {
      re: /\b(?:in|after)\s+(?:(\d+)|a|one)\s+(day|week|month)s?\b/i,
      date: (m) => {
        const n = m[1] ? Number(m[1]) : 1;
        const unit = m[2].toLowerCase();
        if (unit === "day") return shiftDays(now, n);
        if (unit === "week") return shiftDays(now, n * 7);
        const d = new Date(now);
        d.setMonth(d.getMonth() + n);
        return d;
      },
    },
    { re: /\btomorrow\b/i, date: () => shiftDays(now, 1) },
    { re: /\btonight\b|\btoday\b/i, date: () => now },
    { re: /\bnext\s+week\b/i, date: () => shiftDays(now, 7) },
    {
      re: /\bnext\s+month\b/i,
      date: () => {
        const d = new Date(now);
        d.setMonth(d.getMonth() + 1);
        return d;
      },
    },
    {
      re: /\b(?:on\s+|next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
      date: (m) => nextWeekday(now, WEEKDAY_NAMES.indexOf(m[1].toLowerCase())),
    },
  ];

  for (const p of patterns) {
    const m = text.match(p.re);
    if (!m) continue;
    const title = text
      .replace(p.re, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.])/g, "$1")
      .replace(/[\s,]+$/, "")
      .trim();
    return { title: title || text.trim(), due: localDay(p.date(m)) };
  }
  return { title: text.trim(), due: null };
}

const WHEN_CHIPS: { label: string; days: number; business?: boolean }[] = [
  { label: "tomorrow", days: 1 },
  { label: "in 3 days", days: 3 },
  { label: "in 5 business days", days: 5, business: true },
  { label: "next week", days: 7 },
  { label: "in 2 weeks", days: 14 },
  { label: "in a month", days: 30 },
];

const dueLabel = (due: string | null) => {
  if (!due) return "no date";
  if (due === TODAY) return "today";
  const days = Math.round(
    (new Date(`${due}T12:00:00Z`).getTime() -
      new Date(`${TODAY}T12:00:00Z`).getTime()) /
      86400000,
  );
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${-days} days ago`;
  if (days <= 14) return `in ${days} days · ${pretty(due)}`;
  return pretty(due);
};

function ReminderRow({ r, send }: { r: Reminder; send: Send }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(r.title);
  const overdue = !r.done && r.due !== null && r.due < TODAY;
  const today = !r.done && r.due === TODAY;

  const edit = (field: "title" | "due", value: string | null) =>
    send({ action: "editReminder", id: r.id, field, value }, (b) => ({
      ...b,
      reminders: b.reminders.map((x) =>
        x.id === r.id ? { ...x, [field]: value } : x,
      ),
    }));

  return (
    <div className="group flex items-start gap-3 border-b border-line/60 py-2.5 last:border-0">
      <div className="pt-0.5">
        <Tick
          on={r.done}
          onChange={(done) =>
            send({ action: "toggleReminder", id: r.id, done }, (b) => ({
              ...b,
              reminders: b.reminders.map((x) =>
                x.id === r.id ? { ...x, done } : x,
              ),
            }))
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (draft.trim() && draft !== r.title)
                edit("title", draft.trim());
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="w-full rounded-lg border border-line bg-panel px-2 py-1 text-[14px] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(r.title);
              setEditing(true);
            }}
            className={`text-left text-[14px] leading-snug ${
              r.done ? "text-muted line-through" : "text-ink"
            }`}
          >
            {r.title}
          </button>
        )}
        {r.notes ? (
          <p className="mt-0.5 text-[12px] leading-snug text-muted">
            {r.notes}
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-2">
          <span
            className={`text-[12px] ${
              overdue ? "text-bad" : today ? "text-accent-2" : "text-muted"
            }`}
          >
            {dueLabel(r.due)}
          </span>
          <input
            type="date"
            value={r.due ?? ""}
            onChange={(e) => edit("due", e.target.value || null)}
            aria-label="Change the date"
            className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[11px] text-muted opacity-0 transition focus:opacity-100 group-hover:opacity-100"
          />
          {!r.done && r.due ? (
            <button
              type="button"
              onClick={() => edit("due", localDay(shiftDays(new Date(), 7)))}
              className="text-[11px] text-muted opacity-0 transition hover:text-ink group-hover:opacity-100"
            >
              push a week
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          send({ action: "deleteReminder", id: r.id }, (b) => ({
            ...b,
            reminders: b.reminders.filter((x) => x.id !== r.id),
          }))
        }
        aria-label="Delete reminder"
        className="shrink-0 text-[13px] text-muted opacity-0 transition hover:text-bad group-hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

/** A reminder is only useful on the morning it comes due, so the day it lands
 *  (and every day after, until it's ticked) it surfaces inside Today. */
function DueReminders({
  board,
  send,
  day,
}: {
  board: Board;
  send: Send;
  day: string;
}) {
  const due = board.reminders.filter(
    (r) =>
      !r.done &&
      r.due !== null &&
      (day >= TODAY ? r.due <= day : r.due === day),
  );
  if (!due.length) return null;

  const push = (r: Reminder, days: number) =>
    send(
      {
        action: "editReminder",
        id: r.id,
        field: "due",
        value: localDay(shiftDays(new Date(), days)),
      },
      (b) => ({
        ...b,
        reminders: b.reminders.map((x) =>
          x.id === r.id
            ? { ...x, due: localDay(shiftDays(new Date(), days)) }
            : x,
        ),
      }),
    );

  return (
    <section className="mt-7 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold">Check on this</h3>
        <span className="text-[12px] text-muted">
          {due.length === 1 ? "1 reminder" : `${due.length} reminders`}
        </span>
      </div>
      <div className="mt-2">
        {due.map((r) => (
          <div
            key={r.id}
            className="group flex items-start gap-3 border-b border-line/50 py-2.5 last:border-0"
          >
            <div className="pt-0.5">
              <Tick
                on={false}
                onChange={(done) =>
                  send({ action: "toggleReminder", id: r.id, done }, (b) => ({
                    ...b,
                    reminders: b.reminders.map((x) =>
                      x.id === r.id ? { ...x, done } : x,
                    ),
                  }))
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-snug">{r.title}</p>
              {r.notes ? (
                <p className="mt-0.5 text-[12px] leading-snug text-muted">
                  {r.notes}
                </p>
              ) : null}
              <span
                className={`text-[12px] ${r.due !== null && r.due < TODAY ? "text-bad" : "text-muted"}`}
              >
                {dueLabel(r.due)}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => push(r, 1)}
                className="text-[11px] text-muted transition hover:text-ink"
              >
                tomorrow
              </button>
              <button
                type="button"
                onClick={() => push(r, 7)}
                className="text-[11px] text-muted transition hover:text-ink"
              >
                a week
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RemindersPane({ board, send }: { board: Board; send: Send }) {
  const [text, setText] = useState("");
  const [when, setWhen] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const parsed = parseWhen(text);
  const due = when ?? parsed.due;

  const add = () => {
    const title = parsed.title.trim();
    if (!title) return;
    send({ action: "addReminder", title, due: due ?? null }, (b) => ({
      ...b,
      reminders: [
        {
          id: `tmp-${Date.now()}`,
          title,
          due: due ?? null,
          done: false,
          notes: "",
          url: "#",
        },
        ...b.reminders,
      ],
    }));
    setText("");
    setWhen(null);
  };

  const open = board.reminders
    .filter((r) => !r.done)
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const done = board.reminders.filter((r) => r.done);
  const overdue = open.filter((r) => r.due !== null && r.due < TODAY);
  const nowish = open.filter((r) => r.due === TODAY);
  const soon = open.filter(
    (r) =>
      r.due !== null &&
      r.due > TODAY &&
      r.due <= localDay(shiftDays(new Date(), 14)),
  );
  const later = open.filter(
    (r) => r.due === null || r.due > localDay(shiftDays(new Date(), 14)),
  );

  const dbUrl =
    board.dbs.reminders !== "demo"
      ? `https://notion.so/${board.dbs.reminders.replace(/-/g, "")}`
      : null;

  const group = (title: string, rows: Reminder[]) =>
    rows.length ? (
      <Panel
        key={title}
        title={title}
        right={<span className="text-[12px] text-muted">{rows.length}</span>}
      >
        <div>
          {rows.map((r) => (
            <ReminderRow key={r.id} r={r} send={send} />
          ))}
        </div>
      </Panel>
    ) : null;

  return (
    <div className="space-y-4">
      <Panel title="Remind me to…">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="check the Crate & Barrel refund in 5 business days"
              className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[14px] outline-none transition placeholder:text-muted focus:border-ink/30 focus:bg-panel-2"
            />
            <button
              type="button"
              onClick={add}
              className="shrink-0 rounded-xl bg-accent px-4 text-[14px] font-medium text-brand-cream transition hover:opacity-85"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {WHEN_CHIPS.map((c) => {
              const date = localDay(
                c.business
                  ? shiftBusinessDays(new Date(), c.days)
                  : shiftDays(new Date(), c.days),
              );
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setWhen(when === date ? null : date)}
                  className={`rounded-full border px-3 py-1 text-[12px] transition ${
                    when === date
                      ? "border-ink bg-ink text-brand-cream"
                      : "border-line bg-panel text-muted hover:border-ink/30 hover:text-ink"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
            <input
              type="date"
              value={when ?? ""}
              onChange={(e) => setWhen(e.target.value || null)}
              aria-label="Pick a date"
              className="rounded-full border border-line bg-panel px-2.5 py-1 text-[12px] text-muted outline-none"
            />
          </div>
          <p className="text-[12px] leading-relaxed text-muted">
            {due ? (
              <>
                Lands on <span className="text-ink">{weekday(due)}</span>
                {parsed.due && !when ? " — read out of what you typed." : "."}
              </>
            ) : (
              <>
                Write when you want it back: &ldquo;in 5 business days&rdquo;,
                &ldquo;next week&rdquo;, &ldquo;on Friday&rdquo; — or tap a
                chip.
              </>
            )}
          </p>
          {dbUrl ? (
            <p className="text-[12px] text-muted">
              These live in the <span className="text-ink">Reminders</span>{" "}
              database in Notion.{" "}
              <a
                href={dbUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent-2 underline"
              >
                Open it
              </a>
            </p>
          ) : null}
        </div>
      </Panel>

      {group("Overdue", overdue)}
      {group("Today", nowish)}
      {group("Next two weeks", soon)}
      {group("Later", later)}

      {!open.length ? (
        <p className="py-10 text-center text-[14px] text-muted">
          Nothing to come back to. Add the first one above.
        </p>
      ) : null}

      {done.length ? (
        <Panel
          title="Done"
          right={
            <button
              type="button"
              onClick={() => setShowDone(!showDone)}
              className="text-[12px] text-muted transition hover:text-ink"
            >
              {showDone ? "hide" : `show ${done.length}`}
            </button>
          }
        >
          {showDone ? (
            <div>
              {done.map((r) => (
                <ReminderRow key={r.id} r={r} send={send} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">
              {done.length} dealt with this month.
            </p>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- shell */

const TABS = [
  { id: "today", label: "Today" },
  { id: "ideas", label: "Ideas" },
  { id: "todos", label: "Plan week" },
  { id: "reminders", label: "Reminders" },
  { id: "deals", label: "Deals" },
  { id: "agent", label: "Assistant" },
  { id: "habits", label: "Habits" },
  { id: "goals", label: "Goals" },
];

const QUOTES = [
  "You do not rise to the level of your goals, you fall to the level of your systems.",
  "A year from now you'll wish you had started today.",
  "Done is better than perfect.",
  "Small things, done daily, beat big things done once.",
  "You can do anything, but not everything.",
  "Start where you are. Use what you have. Do what you can.",
  "The way to get started is to quit talking and begin doing.",
  "Focus is saying no to a hundred good ideas.",
  "What gets scheduled gets done.",
  "Slow is smooth, smooth is fast.",
  "Discipline is choosing between what you want now and what you want most.",
  "It always seems impossible until it's done.",
  "Action is the antidote to anxiety.",
  "Progress, not perfection.",
  "The days are long but the decades are short.",
];

export default function BoardApp({
  initialKey,
  initialTodoDb,
  initialIdeaDb = "",
}: {
  initialKey: string;
  initialTodoDb: string;
  initialIdeaDb?: string;
}) {
  const [captureKey, setCaptureKey] = useState(initialKey);
  const [todoDb, setTodoDb] = useState(initialTodoDb);
  const [ideaDb, setIdeaDb] = useState(initialIdeaDb);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("today");
  // The deals passcode: held here, sent with every read so the server decides.
  const [dealsCode, setDealsCode] = useState("");
  // Picked after mount so the server and the browser can't disagree on it.
  const [quote, setQuote] = useState("");

  useEffect(
    () => setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]),
    [],
  );
  // When the board last came back from Notion, worded for the header pill.
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [sinceSync, setSinceSync] = useState("just now");
  useEffect(() => {
    const word = () => {
      if (!syncedAt) return setSinceSync("just now");
      const m = Math.round((Date.now() - syncedAt) / 60000);
      setSinceSync(m < 1 ? "just now" : m === 1 ? "1 min ago" : `${m} min ago`);
    };
    word();
    const t = setInterval(word, 30000);
    return () => clearInterval(t);
  }, [syncedAt]);

  // The dashboard is opened from a phone as often as a laptop, so the key is
  // remembered rather than needing the long link every time.
  useEffect(() => {
    if (initialKey) {
      // The sample board would otherwise stick and hide the real Notion later.
      if (initialKey === "demo") localStorage.removeItem("captureKey");
      else localStorage.setItem("captureKey", initialKey);
      return;
    }
    const saved = localStorage.getItem("captureKey");
    // A link that names a database means this Notion, not whatever was opened last.
    if (saved && saved !== "demo" && !initialTodoDb) setCaptureKey(saved);
  }, [initialKey, initialTodoDb]);

  // Pointing the to-dos at an existing Notion list sticks, so the long
  // ?todos=… only has to be opened once.
  useEffect(() => {
    if (initialTodoDb) {
      localStorage.setItem("todoDb", initialTodoDb);
      return;
    }
    const saved = localStorage.getItem("todoDb");
    if (saved) setTodoDb(saved);
  }, [initialTodoDb]);

  // Same for an ideas list kept outside the wizard's content database.
  useEffect(() => {
    if (initialIdeaDb) {
      localStorage.setItem("ideaDb", initialIdeaDb);
      return;
    }
    const saved = localStorage.getItem("ideaDb");
    if (saved) setIdeaDb(saved);
  }, [initialIdeaDb]);

  // Unlocking is per device, so her laptop and phone stay open and a stranger
  // holding the link doesn't.
  useEffect(() => setDealsCode(localStorage.getItem("dealsCode") ?? ""), []);

  const boardUrl = useCallback(
    () =>
      `/api/board?key=${encodeURIComponent(captureKey)}` +
      (todoDb ? `&todos=${encodeURIComponent(todoDb)}` : "") +
      (ideaDb ? `&ideas=${encodeURIComponent(ideaDb)}` : ""),
    [captureKey, todoDb, ideaDb],
  );

  const load = useCallback(async () => {
    if (!captureKey && !todoDb) return;
    setLoading(true);
    try {
      const res = await fetch(boardUrl(), {
        headers: dealsCode ? { "x-deals-code": dealsCode } : undefined,
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
      } & Board;
      if (!json.ok) {
        setError(json.error ?? "Couldn't load your Notion.");
        return;
      }
      setError("");
      setBoard(json);
      setSyncedAt(Date.now());
    } catch {
      setError(
        "Couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [captureKey, todoDb, boardUrl, dealsCode]);

  useEffect(() => {
    void load();
  }, [load]);

  // Writes go to Notion one at a time, and the re-read waits until the
  // burst is over, so a sweep of twenty items is twenty saves and one load.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const reload = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send: Send = (action, optimistic) => {
    setBoard((b) => (b ? optimistic(b) : b));
    // The demo board has nothing to write to, so a re-read would undo the click.
    if (captureKey === "demo") return;
    queue.current = queue.current.then(async () => {
      const res = await fetch(boardUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(dealsCode ? { "x-deals-code": dealsCode } : {}),
        },
        body: JSON.stringify(action),
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!json?.ok)
        setError(json?.error ?? "That didn't save to Notion — reloading.");
      if (reload.current) clearTimeout(reload.current);
      reload.current = setTimeout(() => void load(), 800);
    });
  };

  if (!captureKey && !todoDb) {
    return (
      <div className="board-theme">
        <div className="mx-auto max-w-md space-y-4 px-5 py-16">
          <h1 className="text-[30px] font-semibold tracking-tight">
            Your dashboard
          </h1>
          <p className="text-[15px] leading-relaxed text-muted">
            Paste your capture link (the long one ending in{" "}
            <span className="font-mono">?key=…</span>) and this becomes your
            Notion, in a layout you&apos;d actually look at.
          </p>
          <AddRow
            placeholder="https://…/api/capture?key=…"
            onAdd={(v) => {
              const key = v.includes("key=")
                ? decodeURIComponent(v.split("key=")[1])
                : v.trim();
              localStorage.setItem("captureKey", key);
              setCaptureKey(key);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="board-theme">
      {/* A week and the deal wall need the whole desk; everything else reads
          better narrow. */}
      <div
        className={`mx-auto px-5 pb-20 pt-10 ${
          tab === "todos" || tab === "deals" ? "max-w-[1600px]" : "max-w-5xl"
        }`}
      >
        <header className="mb-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <h1 className="serif text-[34px] leading-none sm:text-[38px]">
                {greeting().replace(".", ", Sophie.")}
              </h1>
              <p className="mt-2.5 min-h-[18px] text-[13px] italic text-muted">
                {quote}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:gap-4 sm:pt-1.5">
              {board ? (
                <span className="hidden sm:inline-flex">
                  <StreakDots board={board} />
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void load()}
                aria-label="Sync with Notion"
                className={`sync-pill transition hover:text-ink ${loading ? "is-busy" : ""}`}
              >
                {loading ? "Syncing with Notion…" : `Synced with Notion ${sinceSync}`}
              </button>
            </div>
          </div>

          <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`-mb-px shrink-0 border-b-2 px-3 pb-2.5 text-[13px] transition ${
                  tab === t.id
                    ? "border-accent font-medium text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.label}
                {t.id === "reminders" && board
                  ? (() => {
                      const dueNow = board.reminders.filter(
                        (r) => !r.done && r.due !== null && r.due <= TODAY,
                      ).length;
                      return dueNow ? (
                        <span className="ml-1.5 rounded-full bg-bad px-1.5 py-0.5 text-[10px] text-brand-cream">
                          {dueNow}
                        </span>
                      ) : null;
                    })()
                  : null}
              </button>
            ))}
          </nav>
        </header>

        {error ? (
          <div className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-[14px]">
            {error}
          </div>
        ) : null}

        {!board ? (
          <p className="py-16 text-center text-[15px] text-muted">
            Reading your Notion…
          </p>
        ) : tab === "today" ? (
          <TodayPane board={board} send={send} />
        ) : tab === "ideas" ? (
          <IdeasPane board={board} send={send} />
        ) : tab === "todos" ? (
          <PlanPane board={board} send={send} />
        ) : tab === "deals" ? (
          board.dealsLocked ? (
            <DealsLock
              tried={!!dealsCode}
              onUnlock={(code) => {
                localStorage.setItem("dealsCode", code);
                setDealsCode(code);
              }}
            />
          ) : (
            <DealsPane board={board} send={send} />
          )
        ) : tab === "reminders" ? (
          <RemindersPane board={board} send={send} />
        ) : tab === "agent" ? (
          <AgentPane board={board} send={send} />
        ) : tab === "habits" ? (
          <HabitsPane board={board} send={send} />
        ) : (
          <GoalsPane board={board} send={send} />
        )}
      </div>
    </div>
  );
}
