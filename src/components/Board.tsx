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
  Deal,
  Goal,
  Habit,
  HabitTick,
  Idea,
  Timing,
  Todo,
} from "@/lib/board";

const CATEGORIES = ["Work", "Personal", "Health", "Money", "Other"];
const AREAS = ["Business", "Content", "Health", "Life"];
const CADENCES = ["Daily", "Weekly", "Monthly"];

const NONE = "Uncategorised";
const PALETTE = [
  "#3b6cf6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#0ea5e9",
  "#84cc16",
  "#f43f5e",
];

/** Categories come from whichever Notion column the to-dos use, so the colours
 *  are derived from the name rather than a fixed list. */
function catColour(name: string | null): string {
  if (!name || name === NONE) return "#9ca3af";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** Rent doesn't care which day suits you. Money that leaves on a date
 *  somebody else set isn't planning material, so the week shows it where it
 *  falls and refuses to let it be dragged somewhere more convenient. */
const MONEY =
  /\b(rent|mortgage|bill|bills|invoice|invoices|payment|pay|paid|tax|taxes|insurance|loan|premium|subscription|dues|deposit|transfer|utilities|electric|water bill|card)\b/i;

const isMoney = (t: Todo) =>
  MONEY.test(t.title) ||
  (t.category ? /financ|money|bill|payment/i.test(t.category) : false);

/** A fixed money item only behaves that way once it has a date to sit on. */
const moneyDay = (t: Todo) => t.due ?? t.plan;
const isFixed = (t: Todo) => isMoney(t) && !!moneyDay(t);

const categoriesOf = (board: Board) =>
  board.categories?.length ? board.categories : CATEGORIES;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date());

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
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => onChange(i.id)}
          className={`rounded-full border px-3 py-1 text-[12px] transition ${
            value === i.id
              ? "border-ink bg-ink text-brand-cream"
              : "border-line bg-panel text-muted hover:border-ink/30 hover:text-ink"
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
  iso(new Date(new Date(`${day}T12:00:00`).getTime() + by * 86400000));

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
    <div className="flex items-baseline gap-3 border-b border-line/60 py-3 last:border-none">
      <span
        className={`shrink-0 text-[13px] ${said ? "text-accent-2" : "text-muted/40"}`}
      >
        {said ? "✓" : "›"}
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="serif pointer-events-none whitespace-pre-wrap text-[19px] leading-snug">
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
            className="serif absolute inset-0 w-full resize-none bg-transparent text-[19px] leading-snug text-transparent caret-ink outline-none"
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
    <div className="day-card mb-5 p-6 sm:p-7">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {saidAll(board, TODAY) ? "Written today" : "Write them out"}
        </p>
        <span className="shrink-0 text-[12px] text-muted">
          {streak
            ? `${streak} day${streak === 1 ? "" : "s"} running`
            : "start it today"}
        </span>
      </div>
      <div className="mt-1">
        {lines.map((h) => (
          <TraceLine key={h.id} board={board} send={send} habit={h} />
        ))}
      </div>
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
    .filter((t) => !t.done && !(t.slot && pickedOn(t, day)))
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
  const picks = suggestFor(board, day).slice(0, room);
  if (hidden || !picks.length) return null;

  const cost = (t: Todo) => t.minutes ?? estimateFor(board.timings, t.title);
  let running = 0;
  const fits = picks.filter((p) => {
    const m = cost(p.todo) ?? 0;
    if (free > 0 && running + m > free && running > 0) return false;
    running += m;
    return true;
  });

  return (
    <div className="mt-4 rounded-2xl border border-line bg-panel-2 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[12px] font-semibold">
          Suggested from your Notion
        </h4>
        <div className="flex shrink-0 items-center gap-3">
          {fits.length > 1 ? (
            <button
              type="button"
              onClick={() =>
                fits.forEach((p) => pick(p.todo, "deep", send, day))
              }
              className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted transition hover:text-ink"
            >
              take these {fits.length}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setHidden(true)}
            className="text-[11px] text-muted hover:text-ink"
          >
            not now
          </button>
        </div>
      </div>
      <div className="mt-2">
        {picks.map((p) => {
          const m = cost(p.todo);
          return (
            <button
              key={p.todo.id}
              type="button"
              onClick={() => pick(p.todo, "deep", send, day)}
              className="flex w-full items-center gap-3 border-b border-line/60 py-2 text-left last:border-none"
            >
              <span className="shrink-0 text-[13px] text-muted">+</span>
              <span className="min-w-0 flex-1 truncate text-[14px]">
                {p.todo.title}
              </span>
              <span
                className={`shrink-0 text-[11px] ${p.why.includes("late") ? "text-bad" : "text-muted"}`}
              >
                {p.why}
                {m ? ` · ~${spell(m)}` : ""}
              </span>
            </button>
          );
        })}
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
    (t) => !t.done && !(t.slot && pickedOn(t, day)) && !urgent.includes(t),
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
      className={`border-b border-line/70 py-3 last:border-none ${dim ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-4">
        <span
          className={`shrink-0 rounded-full border border-line ${
            slot === "deep" ? "h-6 w-6 rounded-full" : "h-5 w-5 rounded-md"
          }`}
        />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={placeholder}
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/70 ${
            slot === "deep" ? "serif text-[20px]" : "text-[15px]"
          }`}
        />
        <button
          type="button"
          onClick={() => setBrowsing(!browsing)}
          className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[12px] text-muted transition hover:text-ink"
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
    <div className="border-b border-line/70 py-3 last:border-none">
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
              ? "border-ink bg-ink text-brand-cream"
              : "border-line hover:border-ink/40"
          }`}
        >
          {todo.done ? "✓" : ""}
        </button>
        <span
          className={`serif min-w-0 flex-1 truncate text-[20px] ${todo.done ? "text-muted line-through" : ""}`}
        >
          {todo.title}
        </span>
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
        <button
          type="button"
          onClick={() => park(todo, send, day)}
          className="shrink-0 text-[12px] text-muted transition hover:text-ink"
        >
          park it
        </button>
      </div>
    </div>
  );
}

function QuickRow({
  todo,
  send,
  locked,
  day,
}: {
  todo: Todo;
  send: Send;
  locked?: boolean;
  day: string;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-line/70 py-2.5 last:border-none">
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
        <span className="shrink-0 text-[11px] text-muted">every day</span>
      ) : null}
      <Timer todo={todo} send={send} />
      {locked ? null : (
        <button
          type="button"
          onClick={() => park(todo, send, day)}
          className="shrink-0 text-[12px] text-muted transition hover:text-ink"
        >
          park it
        </button>
      )}
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
      className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-muted transition hover:text-ink"
    >
      {children}
    </button>
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
    <>
      {day === TODAY ? <Affirmations board={board} send={send} /> : null}
      <div className="day-card p-7 sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {dayStamp(day)}
            </p>
            <h2 className="serif mt-2 text-[30px] leading-tight sm:text-[34px]">
              {dayQuestion(day)}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Arrow label="Day before" onClick={() => setDay(shiftDay(day, -1))}>
              ←
            </Arrow>
            {day === TODAY ? null : (
              <button
                type="button"
                onClick={() => setDay(TODAY)}
                className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted transition hover:text-ink"
              >
                today
              </button>
            )}
            <Arrow label="Day after" onClick={() => setDay(shiftDay(day, 1))}>
              →
            </Arrow>
          </div>
        </div>

        {nudge ? (
          <button
            type="button"
            onClick={() => setDay(tomorrow)}
            className="mt-6 flex w-full items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-left transition hover:border-warn"
          >
            <span className="text-[14px]">
              Tomorrow is still empty. Pick its three while today is fresh.
            </span>
            <span className="shrink-0 text-[13px] text-muted">choose →</span>
          </button>
        ) : null}

        <section className="mt-9">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold">
              {day === TODAY ? "Today\u2019s three" : "The three"}
            </h3>
            <span className="text-[12px] text-muted">
              {deep.filter((t) => !t.done).length}/3 taken
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 pb-1">
            <span className="text-[15px]">
              Hours available {day === TODAY ? "today" : "that day"}
            </span>
            <span className="flex items-baseline gap-1">
              <input
                value={hours}
                onChange={(e) =>
                  setAvailable(e.target.value.replace(/[^\d.]/g, ""))
                }
                placeholder="—"
                inputMode="decimal"
                className="w-14 border-b border-line bg-transparent py-1 text-right text-[15px] outline-none focus:border-ink/40"
              />
              <span className="text-[14px] text-muted">h</span>
            </span>
          </div>

          {calendar ? (
            <p className="text-[12px] text-muted">
              {calendar.connected ? (
                calendar.busy !== undefined ? (
                  calendar.busy > 0 ? (
                    `Your calendar already has ${spell(calendar.busy)} booked in what's left of today.`
                  ) : (
                    "Nothing left in your calendar today."
                  )
                ) : (
                  calendar.error
                )
              ) : (
                <a
                  className="underline underline-offset-2 hover:text-ink"
                  href={connectCalendarHref()}
                >
                  {calendar.error ?? "Use my Google Calendar"}
                </a>
              )}
            </p>
          ) : null}

          {load > 0 ? (
            <p
              className={`mt-3 text-[13px] ${overloaded ? "text-bad" : "text-muted"}`}
            >
              {overloaded
                ? `Those three have cost about ${spell(load)} before — more than the ${spell(free)} you have. Park one.`
                : `Based on how long these took before, that's about ${spell(load)} of work.`}
            </p>
          ) : null}

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

          <div className="mt-3">
            {deep.map((t) => (
              <DeepRow
                key={t.id}
                todo={t}
                board={board}
                send={send}
                day={day}
              />
            ))}
            {Array.from(
              { length: Math.max(0, DEEP_CAP - deep.length) },
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

        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold">Quick batch</h3>
            <span className="text-[12px] text-muted">
              three, and one of them is email
            </span>
          </div>
          <div className="mt-3">
            {emails ? (
              <QuickRow todo={emails} send={send} locked day={day} />
            ) : (
              <button
                type="button"
                onClick={addEmails}
                className="flex w-full items-center gap-4 border-b border-line/70 py-2.5 text-left"
              >
                <span className="h-5 w-5 shrink-0 rounded-md border border-line" />
                <span className="min-w-0 flex-1 text-[15px] text-muted">
                  Go through emails
                </span>
                <span className="shrink-0 text-[11px] text-muted">
                  tap to take it on
                </span>
              </button>
            )}
            {otherQuick.map((t) => (
              <QuickRow key={t.id} todo={t} send={send} day={day} />
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
          <section className="mt-10">
            <h3 className="text-[13px] font-semibold">Habits</h3>
            <div className="mt-4 flex flex-wrap gap-6">
              {dailyHabits.map((h) => {
                const on = doneToday.has(h.id);
                const streak = streakOf(board.ticks, h.id, day);
                const best = bestStreak(board.ticks, h.id);
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => tickHabit(board, send, h, day, !on)}
                    className="w-20"
                  >
                    <span
                      className={`mx-auto grid h-14 w-14 place-items-center rounded-full text-[15px] font-medium transition ${
                        on
                          ? "bg-warn text-brand-cream"
                          : "border border-line bg-panel-2 text-muted"
                      }`}
                    >
                      {streak || ""}
                    </span>
                    <span className="mt-2 block truncate text-[12px] text-muted">
                      {h.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted/80">
                      {streak
                        ? `🔥 ${streak} day${streak === 1 ? "" : "s"}`
                        : best
                          ? `best ${best}`
                          : "start it"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

/** The next Monday, so an idea that becomes work lands on the week you plan
 *  rather than in the middle of today. */
function comingMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return iso(d);
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
      todos: b.todos.map((t) => (t.id === todo.id ? { ...t, title: value } : t)),
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
      className={`min-w-0 flex-1 truncate text-left text-[13px] ${className ?? ""}`}
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
      title={todo.due ? `Due ${pretty(todo.due)} — tap to change` : "Set a date"}
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
      className="flex cursor-grab items-center gap-2 py-1 active:cursor-grabbing"
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
        className={`grid h-4 w-4 shrink-0 place-items-center text-[9px] transition ${
          todo.slot === "deep" ? "rounded-full" : "rounded"
        } border ${todo.done ? "border-ink bg-ink text-brand-cream" : "border-line hover:border-ink/40"}`}
      >
        {todo.done ? "✓" : ""}
      </button>
      <EditTitle
        todo={todo}
        send={send}
        onEditing={setEditing}
        className={todo.done ? "text-muted line-through" : ""}
      />
      <EditDue todo={todo} send={send} />
      <button
        type="button"
        onClick={() => park(todo, send, day)}
        title="Put it back on the pile"
        className="shrink-0 text-[12px] text-muted transition hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}

/** The pile the week gets planned out of: everything real in Notion that
 *  hasn't been promised to a day yet, dragged across one at a time. */
function PlanPile({ board, send }: { board: Board; send: Send }) {
  const [q, setQ] = useState("");
  const [goal, setGoal] = useState("");
  const [over, setOver] = useState(false);
  const open = board.todos.filter((t) => !t.done && !t.slot && !isFixed(t));
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
      className={`rounded-xl border p-3 transition ${over ? "border-ink/40 bg-ink/5" : "border-line"}`}
    >
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12px] font-medium">{over ? "Drop it back here" : "Waiting in Notion"}</span>
        <span className="text-[11px] text-muted">{waiting.length}</span>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find something…"
        className="mb-2 w-full rounded-lg border border-line bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-muted/70"
      />
      {goals.length ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {[{ id: "", name: "Everything" }, ...goals].map((g) => (
            <button
              key={g.id || "all"}
              type="button"
              onClick={() => setGoal(g.id)}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                goal === g.id
                  ? "border-ink bg-ink text-brand-cream"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-[520px] space-y-1 overflow-auto">
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
          <p className="text-[13px] text-muted">
            Nothing waiting — the pile is empty.
          </p>
        )}
      </div>
      <p className="mt-2 text-[12px] text-muted">
        Drag one onto a day, or drag one back here to unplan it. On a phone, use + deep / + quick and × instead.
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

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/todo-id", todo.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="flex cursor-grab items-center gap-2 rounded-lg border border-line/70 px-2 py-1.5 text-[13px] transition hover:border-ink/30 active:cursor-grabbing"
    >
      <span className="shrink-0 text-[11px] text-muted">⠿</span>
      <EditTitle todo={todo} send={send} onEditing={setEditing} />
      {goalName ? (
        <span className="shrink-0 rounded-full bg-panel-2 px-1.5 text-[10px] text-muted">
          {goalName}
        </span>
      ) : null}
      <EditDue todo={todo} send={send} />
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
      className={`flex items-center justify-center gap-2 rounded-xl border border-dashed py-4 text-[13px] transition ${
        over ? "border-bad bg-bad/10 text-bad" : "border-line text-muted"
      }`}
    >
      <span className="text-[16px]">🗑</span>
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
      className={`flex items-center justify-center gap-2 rounded-xl border border-dashed py-4 text-[13px] transition ${
        over ? "border-ink/40 bg-ink/5 text-ink" : "border-line text-muted"
      }`}
    >
      <span className="text-[16px]">🤖</span>
      <span className="min-w-0 truncate">
        {over
          ? "Drop it and the assistant takes it"
          : gone
            ? `Handed over: ${gone}`
            : "Drag here to hand to assistant"}
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
function MoneyDue({ rows, send }: { rows: Todo[]; send: Send }) {
  return (
    <div className="zone-money mb-1.5 rounded-lg border px-2 py-1.5">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest">money due</span>
        <span className="text-[10px] opacity-70">can&rsquo;t be moved</span>
      </div>
      {rows.map((t) => (
        <div key={t.id} className="flex items-center gap-2 py-0.5">
          <button
            type="button"
            aria-label={t.done ? "Mark as not paid" : "Mark paid"}
            onClick={() =>
              send({ action: "toggleTodo", id: t.id, done: !t.done }, (b) => ({
                ...b,
                todos: b.todos.map((x) =>
                  x.id === t.id ? { ...x, done: !t.done } : x,
                ),
              }))
            }
            className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px] transition ${
              t.done
                ? "border-current bg-current text-brand-cream"
                : "border-current/40 hover:border-current"
            }`}
          >
            {t.done ? "✓" : ""}
          </button>
          <EditTitle
            todo={t}
            send={send}
            className={t.done ? "line-through opacity-60" : ""}
          />
          <EditDue todo={t} send={send} />
          <span className="shrink-0 text-[11px] opacity-70">💸</span>
        </div>
      ))}
    </div>
  );
}

/** One day of the week being planned: the deep blocks, the quick ones, and
 *  room to fill what's still empty — the caps are what make a week plannable
 *  instead of a wish list. */
function PlanDay({
  board,
  send,
  day,
}: {
  board: Board;
  send: Send;
  day: string;
}) {
  const [open, setOpen] = useState<null | "deep" | "quick">(null);
  const [draft, setDraft] = useState("");
  const [over, setOver] = useState<null | "deep" | "quick">(null);
  const [warn, setWarn] = useState<{
    todo: Todo;
    into: "deep" | "quick";
  } | null>(null);
  const picked = board.todos.filter(
    (t) => t.slot && pickedOn(t, day) && !isFixed(t),
  );
  const fixed = board.todos.filter((t) => isFixed(t) && moneyDay(t) === day);
  const deep = picked.filter((t) => t.slot === "deep");
  const quick = picked.filter((t) => t.slot === "quick");
  const slot = open ?? "deep";

  const urgent = suggestFor(board, day);
  const rest = board.todos.filter(
    (t) =>
      !t.done &&
      !isFixed(t) &&
      !(t.slot && pickedOn(t, day)) &&
      !urgent.some((s) => s.todo.id === t.id),
  );
  const candidates = [...urgent.map((s) => s.todo), ...rest].slice(0, 40);

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
        className={`rounded-lg border border-dashed px-1.5 py-1 transition ${
          over === kind ? "border-ink/40 bg-ink/5" : "border-transparent"
        }`}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-widest text-muted">
            {kind}
          </span>
          <span
            className={`text-[10px] ${rows.length > cap ? "text-bad" : "text-muted"}`}
          >
            {rows.length}/{cap}
          </span>
        </div>
        {rows.map((t) => (
          <PlanRow key={t.id} todo={t} send={send} day={day} />
        ))}
        {kind === "quick" && !hasEmail ? (
          <button
            type="button"
            onClick={takeEmails}
            className="flex w-full items-center gap-2 py-1 text-left text-[13px] text-muted/70 transition hover:text-ink"
          >
            <span className="h-3.5 w-3.5 shrink-0 rounded border border-dashed border-line" />
            <span className="min-w-0 flex-1 truncate">Go through emails</span>
          </button>
        ) : null}
        {!rows.length && kind === "deep" ? (
          <p className="py-1 text-[12px] text-muted/70">Drop one here.</p>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={`rounded-xl border p-3 ${day === TODAY ? "border-ink/30 bg-panel" : "border-line"} ${
        day < TODAY ? "opacity-60" : ""
      }`}
    >
      <div className="mb-1.5 flex items-baseline justify-between">
        <span
          className={`text-[12px] ${day === TODAY ? "font-medium text-ink" : "text-muted"}`}
        >
          {weekday(day)}
        </span>
        <span className="text-[11px] text-muted">
          {picked.filter((t) => !t.done).length || ""}
        </span>
      </div>

      {fixed.length ? <MoneyDue rows={fixed} send={send} /> : null}

      <div className="mb-1 space-y-1">
        {zone("deep", deep)}
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

      <div className="flex gap-1.5">
        {(["deep", "quick"] as const).map((s) => {
          const full =
            (s === "deep" ? deep.length : quick.length) >=
            (s === "deep" ? DEEP_CAP : QUICK_CAP);
          return (
            <button
              key={s}
              type="button"
              disabled={full}
              onClick={() => setOpen(open === s ? null : s)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                open === s
                  ? "border-ink/40 text-ink"
                  : "border-line text-muted hover:text-ink"
              } disabled:opacity-30`}
            >
              {full ? `${s} is full` : `+ ${s}`}
            </button>
          );
        })}
      </div>

      {open && room ? (
        <div className="mt-2 space-y-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={
              open === "deep" ? "A real block of work…" : "Something quick…"
            }
            className="w-full rounded-lg border border-line bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-muted/70"
          />
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
                Nothing waiting in Notion.
              </p>
            )}
          </div>
        </div>
      ) : null}
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
                      background: `${catColour(t.category)}1f`,
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
  const cats = categoriesOf(board);
  const days = planWeek(week);
  const pickedIn = (list: string[]) =>
    board.todos.filter((t) => t.slot && list.some((d) => pickedOn(t, d)));
  const planned = pickedIn(days);
  const empty = days.filter(
    (d) => d >= TODAY && !planned.some((t) => pickedOn(t, d)),
  ).length;
  const late = board.todos.filter((t) => !t.done && t.due && t.due < TODAY);
  // Sunday is when the week is decided, so that's when the page offers to.
  const sunday = new Date(`${TODAY}T12:00:00`).getDay() === 0;
  const nextEmpty = pickedIn(planWeek(week + 1)).length === 0;

  return (
    <Panel
      title="Plan the week"
      right={
        <Pills
          items={[
            { id: "plan", label: "Week" },
            { id: "calendar", label: "Calendars" },
          ]}
          value={view}
          onChange={setView}
        />
      }
    >
      {view === "plan" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px]">
              <span className="font-medium">
                {pretty(days[0])} – {pretty(days[6])}
              </span>
              <span className="ml-2 text-[12px] text-muted">
                {planned.filter((t) => !t.done).length} planned
                {empty
                  ? ` · ${empty} ${empty === 1 ? "day" : "days"} still empty`
                  : " · every day has something"}
              </span>
            </div>
            <div className="flex gap-1.5">
              <Arrow label="Previous week" onClick={() => setWeek(week - 1)}>
                ←
              </Arrow>
              <Arrow label="This week" onClick={() => setWeek(0)}>
                this week
              </Arrow>
              <Arrow label="Next week" onClick={() => setWeek(week + 1)}>
                →
              </Arrow>
            </div>
          </div>

          {sunday && week === 0 && nextEmpty ? (
            <button
              type="button"
              onClick={() => setWeek(week + 1)}
              className="w-full rounded-xl border border-accent-2/40 bg-accent-2/5 p-3 text-left"
            >
              <span className="text-[13px] font-medium text-accent-2">
                It&rsquo;s Sunday — set up next week.
              </span>
              <span className="ml-2 text-[12px] text-muted">
                Two or three a day is a week that actually happens.
              </span>
            </button>
          ) : null}

          {late.length && week === 0 ? (
            <details className="rounded-xl border border-bad/40 bg-bad/5 p-3">
              <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-widest text-bad">
                Late · {late.length}
              </summary>
              <div className="pt-1">
                {late.map((t) => (
                  <TodoRow key={t.id} todo={t} send={send} cats={cats} />
                ))}
              </div>
            </details>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
            <div className="grid gap-2 sm:grid-cols-2">
              {days.map((d) => (
                <PlanDay key={d} board={board} send={send} day={d} />
              ))}
            </div>
            <div className="space-y-2">
              <PlanPile board={board} send={send} />
              <PlanHandoff board={board} send={send} />
              <PlanTrash board={board} send={send} />
            </div>
          </div>

          <p className="text-[12px] text-muted">
            Everything else stays in Notion — this is only what you&rsquo;ve
            promised each day.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">
              {monthGrid(month).label}
            </span>
            <div className="flex gap-1.5">
              <Arrow label="Previous month" onClick={() => setMonth(month - 1)}>
                ←
              </Arrow>
              <Arrow label="This month" onClick={() => setMonth(0)}>
                this month
              </Arrow>
              <Arrow label="Next month" onClick={() => setMonth(month + 1)}>
                →
              </Arrow>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <MonthCal kind="deadline" items={board.todos} offset={month} />
            <MonthCal kind="want" items={board.todos} offset={month} />
          </div>
        </div>
      )}
    </Panel>
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

/** A deal is done when the money arrives, not when the video goes up. */
const isPaid = (d: Deal) => (d.paid === null ? d.stage === "Paid" : d.paid);
const isOwed = (d: Deal) =>
  !isPaid(d) &&
  (d.invoiced || (d.stage ? /invoic|deliver/i.test(d.stage) : false));

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
      onClick={() => onChange(!on)}
      className={`ml-1 rounded-full border px-2 py-0.5 text-[11px] transition ${
        on ? "border-ok bg-ok text-brand-cream" : "border-line text-muted hover:text-ink"
      }`}
    >
      {on ? `✓ ${label}` : label}
    </button>
  );
}

/** A deal is only finished when the money lands, so everything short of Paid
 *  still counts as owed to you. */
function DealCard({
  deal,
  board,
  send,
}: {
  deal: Deal;
  board: Board;
  send: Send;
}) {
  const [adding, setAdding] = useState("");
  const stages = board.dealStages;
  const at = deal.stage ? stages.indexOf(deal.stage) : -1;
  const next = at >= 0 && at < stages.length - 1 ? stages[at + 1] : at < 0 ? stages[0] : null;
  const tasks = board.todos.filter((t) => t.deal === deal.id);
  const left = tasks.filter((t) => !t.done).length;

  const edit = (
    field: "brand" | "stage" | "fee" | "due" | "contact" | "invoiced" | "paid",
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
                  : field === "contact"
                    ? { contact: value ?? "" }
                    : field === "due"
                      ? { due: value }
                      : field === "invoiced"
                        ? { invoiced: value === "on" }
                        : field === "paid"
                          ? { paid: value === "on" }
                          : { stage: value }),
            }
          : d,
      ),
    }));

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

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          defaultValue={deal.brand}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== deal.brand) edit("brand", v);
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[14px] font-medium outline-none transition hover:border-line focus:border-ink/30"
        />
        <input
          type="number"
          defaultValue={deal.fee ?? ""}
          placeholder="fee"
          onBlur={(e) => edit("fee", e.target.value || null)}
          className="w-[86px] rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-[13px] outline-none transition hover:border-line focus:border-ink/30"
        />
        <input
          type="date"
          value={deal.due ?? ""}
          aria-label="Deliverable due"
          onChange={(e) => edit("due", e.target.value || null)}
          className={`w-[126px] rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] outline-none transition hover:border-line ${
            deal.due && deal.due < TODAY && !deal.paid ? "text-bad" : "text-muted"
          }`}
        />
        <button
          type="button"
          onClick={() =>
            send({ action: "deleteDeal", id: deal.id }, (b) => ({
              ...b,
              deals: b.deals.filter((d) => d.id !== deal.id),
            }))
          }
          title="Remove this deal"
          className="text-[12px] text-muted transition hover:text-bad"
        >
          ×
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <select
          value={deal.stage ?? ""}
          aria-label="What this deal needs next"
          onChange={(e) => edit("stage", e.target.value || null)}
          className="rounded-full border border-line bg-transparent px-2 py-0.5 text-[11px] outline-none"
        >
          <option value="">not started</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
        {next ? (
          <button
            type="button"
            onClick={() => edit("stage", next)}
            className="rounded-full border border-ink bg-ink px-2 py-0.5 text-[11px] text-brand-cream transition hover:opacity-90"
          >
            done → {next.toLowerCase()}
          </button>
        ) : null}
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
      </div>

      <div className="mt-2 space-y-0.5">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
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
              className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px] transition ${
                t.done
                  ? "border-ink bg-ink text-brand-cream"
                  : "border-line hover:border-ink/40"
              }`}
            >
              {t.done ? "✓" : ""}
            </button>
            <span
              className={`min-w-0 flex-1 truncate text-[13px] ${t.done ? "text-muted line-through" : ""}`}
            >
              {t.title}
            </span>
            <span className="shrink-0 text-[10px] text-muted">
              {t.plan ? pretty(t.plan) : "no day"}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="+ a to-do for this deal…"
          className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-muted/70"
        />
        <span className="shrink-0 text-[11px] text-muted">
          {tasks.length ? `${left} left` : "no to-dos yet"}
        </span>
      </div>
    </div>
  );
}

/** The question this tab answers is "what do I owe a brand this week", so the
 *  deals are stacked by the work they're waiting on — script, film, edit,
 *  post — and the negotiation end sits out of the way at the bottom. */
function DealsPane({ board, send }: { board: Board; send: Send }) {
  const dead = (d: Deal) =>
    isPaid(d) || /passed|declined/i.test(`${d.stage ?? ""} ${d.status ?? ""}`);
  const live = board.deals.filter((d) => !dead(d));
  const paid = board.deals.filter(isPaid);
  const owed = live.filter(isOwed).reduce((n, d) => n + (d.fee ?? 0), 0);
  const booked = live.reduce((n, d) => n + (d.fee ?? 0), 0);
  const loose = board.todos.filter(
    (t) => !t.deal && !t.done && /brand|deal|sponsor|ugc/i.test(t.title),
  );

  // Anything before a signature isn't work yet; it shouldn't crowd the top.
  const talking = (d: Deal) =>
    !d.stage || /inquiry|negotiat|prospect|contact|testing/i.test(d.stage);
  const buckets = board.dealStages
    .filter((s) => !/passed|declined|inquiry|negotiat|prospect|contact|testing/i.test(s))
    .map((stage) => ({ stage, deals: live.filter((d) => d.stage === stage) }))
    .filter((b) => b.deals.length);
  const early = live.filter(talking);

  return (
    <div className="space-y-4">
      {buckets.map(({ stage, deals }) => (
        <Panel
          key={stage}
          title={stage}
          right={<span className="text-[12px] text-muted">{deals.length}</span>}
        >
          <div className="space-y-2">
            {deals.map((d) => (
              <DealCard key={d.id} deal={d} board={board} send={send} />
            ))}
          </div>
        </Panel>
      ))}

      <Panel
        title={buckets.length ? "Talking, not signed" : "Brand deals"}
        right={
          <span className="text-[12px] text-muted">
            {money(booked)} live{owed ? ` · ${money(owed)} unpaid` : ""}
          </span>
        }
      >
        <div className="space-y-2">
          {early.length ? (
            early.map((d) => (
              <DealCard key={d.id} deal={d} board={board} send={send} />
            ))
          ) : (
            <p className="text-[13px] text-muted">
              Nothing in the inbox stage — add the next brand below.
            </p>
          )}
        </div>
        <div className="mt-3">
          <AddRow
            placeholder="New deal — the brand's name…"
            onAdd={(brand) =>
              send({ action: "addDeal", brand }, (b) => ({
                ...b,
                deals: [
                  ...b.deals,
                  {
                    id: `tmp-${Date.now()}`,
                    brand,
                    stage: board.dealStages[0] ?? null,
                    status: null,
                    fee: null,
                    due: null,
                    contact: "",
                    link: null,
                    notes: "",
                    invoiced: false,
                    paid: false,
                    url: "#",
                  },
                ],
              }))
            }
          />
        </div>
      </Panel>

      {paid.length ? (
        <Panel title="Paid" right={<span className="text-[12px] text-muted">{paid.length}</span>}>
          <div className="space-y-1">
            {paid.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{d.brand}</span>
                <span className="shrink-0 text-muted">
                  {d.fee ? money(d.fee) : ""}
                </span>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[11px] text-muted hover:text-ink"
                >
                  open
                </a>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {loose.length ? (
        <Panel
          title="Brand to-dos with no deal"
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
                  {board.deals.map((d) => (
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

/* ------------------------------------------------------------------- shell */

const TABS = [
  { id: "today", label: "Today" },
  { id: "ideas", label: "Ideas" },
  { id: "todos", label: "Plan week" },
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
  // Picked after mount so the server and the browser can't disagree on it.
  const [quote, setQuote] = useState("");

  useEffect(
    () => setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]),
    [],
  );

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
      const res = await fetch(boardUrl());
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
    } catch {
      setError(
        "Couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [captureKey, todoDb, boardUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const send: Send = (action, optimistic) => {
    setBoard((b) => (b ? optimistic(b) : b));
    // The demo board has nothing to write to, so a re-read would undo the click.
    if (captureKey === "demo") return;
    void (async () => {
      const res = await fetch(boardUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!json?.ok)
        setError(json?.error ?? "That didn't save to Notion — reloading.");
      void load();
    })();
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
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-10">
        <header className="mb-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="serif text-[34px] leading-none sm:text-[38px]">
                {greeting().replace(".", ", Sophie.")}
              </h1>
              <p className="mt-2.5 min-h-[18px] text-[13px] italic text-muted">
                {quote}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4 pt-1.5">
              {board ? <StreakDots board={board} /> : null}
              <button
                type="button"
                onClick={() => void load()}
                aria-label="Sync with Notion"
                className="text-[13px] text-muted transition hover:text-ink"
              >
                {loading ? "syncing…" : "sync"}
              </button>
            </div>
          </div>

          <nav className="mt-6 flex gap-5 overflow-x-auto border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`-mb-px shrink-0 border-b-2 pb-2.5 text-[13px] tracking-wide transition ${
                  tab === t.id
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.label}
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
          <DealsPane board={board} send={send} />
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
