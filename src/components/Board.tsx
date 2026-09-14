"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Action, Board, Goal, Habit, HabitTick, Idea, Todo } from "@/lib/board";

const CATEGORIES = ["Work", "Personal", "Health", "Money", "Other"];
const AREAS = ["Business", "Content", "Health", "Life"];
const CADENCES = ["Daily", "Weekly", "Monthly"];

const NONE = "Uncategorised";
const PALETTE = ["#3b6cf6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#84cc16", "#f43f5e"];

/** Categories come from whichever Notion column the to-dos use, so the colours
 *  are derived from the name rather than a fixed list. */
function catColour(name: string | null): string {
  if (!name || name === NONE) return "#9ca3af";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const categoriesOf = (board: Board) => (board.categories?.length ? board.categories : CATEGORIES);
const groupOf = (todo: Todo, cats: string[]) => (todo.category && cats.includes(todo.category) ? todo.category : NONE);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date());

function monthDays(): string[] {
  const now = new Date();
  const days = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) =>
    iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), i + 1))),
  );
}

const pretty = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";

/* ------------------------------------------------------------ small pieces */

function Tick({ on, onChange, dim, ring }: { on: boolean; onChange: (v: boolean) => void; dim?: boolean; ring?: boolean }) {
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

function Box({ on, onChange, tone = "ok" }: { on: boolean; onChange: (v: boolean) => void; tone?: "ok" | "bad" }) {
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

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-panel-2">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-[13px] font-medium tracking-tight text-ink">{title}</h2>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [value, setValue] = useState("");
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue("");
  };
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[14px] outline-none transition placeholder:text-muted focus:border-ink/30 focus:bg-panel-2"
      />
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

function TodoRow({ todo, send }: { todo: Todo; send: Send }) {
  const overdue = !todo.done && todo.due && todo.due < TODAY;
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-none">
      <Box
        on={todo.done}
        onChange={(done) =>
          send({ action: "toggleTodo", id: todo.id, done }, (b) => ({
            ...b,
            todos: b.todos.map((t) => (t.id === todo.id ? { ...t, done } : t)),
          }))
        }
      />
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: catColour(todo.category) }} />
      <span className={`min-w-0 flex-1 truncate text-[14px] ${todo.done ? "text-muted line-through" : ""}`}>
        {todo.title}
      </span>
      {todo.source === "Siri" ? <span className="shrink-0 text-[11px] text-muted">🎙</span> : null}
      <input
        type="date"
        value={todo.due ?? ""}
        onChange={(e) =>
          send({ action: "editTodo", id: todo.id, field: "due", value: e.target.value || null }, (b) => ({
            ...b,
            todos: b.todos.map((t) => (t.id === todo.id ? { ...t, due: e.target.value || null } : t)),
          }))
        }
        className={`w-[112px] shrink-0 rounded-lg border border-transparent bg-transparent px-1 py-1 text-right text-[12px] ${
          overdue ? "text-bad" : "text-muted"
        } hover:border-line`}
      />
      <button
        type="button"
        aria-label="Delete"
        onClick={() =>
          send({ action: "deleteTodo", id: todo.id }, (b) => ({ ...b, todos: b.todos.filter((t) => t.id !== todo.id) }))
        }
        className="shrink-0 text-[13px] text-muted/60 hover:text-bad"
      >
        ✕
      </button>
    </div>
  );
}

function TodayPane({ board, send }: { board: Board; send: Send }) {
  const open = board.todos.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due && t.due < TODAY);
  const today = open.filter((t) => t.due === TODAY || t.plan === TODAY);
  const inbox = open.filter((t) => !t.due && !t.plan);
  const dailyHabits = board.habits.filter((h) => h.cadence === "Daily" && !h.bad);
  const doneToday = new Set(board.ticks.filter((t) => t.date === TODAY).map((t) => t.habitId));
  const freshIdeas = board.ideas.filter((i) => (i.status ?? "Inbox") === "Inbox").slice(0, 5);

  return (
    <div className="space-y-4">
      <Panel
        title={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        right={<span className="text-[12px] text-muted">{today.length + overdue.length} to do</span>}
      >
        <div className="space-y-3">
          <AddRow
            placeholder="Add something for today…"
            onAdd={(title) =>
              send({ action: "addTodo", title, due: TODAY, category: "Other" }, (b) => ({
                ...b,
                todos: [
                  ...b.todos,
                  {
                    id: `tmp-${Date.now()}`,
                    title,
                    done: false,
                    due: TODAY,
                    plan: null,
                    category: "Other",
                    priority: null,
                    link: null,
                    source: "Manual",
                  },
                ],
              }))
            }
          />
          {overdue.length ? (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-widest text-bad">Late</div>
              {overdue.map((t) => (
                <TodoRow key={t.id} todo={t} send={send} />
              ))}
            </div>
          ) : null}
          {today.length ? (
            today.map((t) => <TodoRow key={t.id} todo={t} send={send} />)
          ) : (
            <p className="py-2 text-[14px] text-muted">Nothing scheduled for today.</p>
          )}
          {inbox.length ? (
            <details>
              <summary className="cursor-pointer text-[13px] text-muted">
                {inbox.length} with no date (from Siri and the share sheet)
              </summary>
              <div className="mt-2">
                {inbox.map((t) => (
                  <TodoRow key={t.id} todo={t} send={send} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </Panel>

      {dailyHabits.length ? (
        <Panel title="Habits today" right={<span className="text-[12px] text-muted">{doneToday.size}/{dailyHabits.length}</span>}>
          <div className="flex flex-wrap gap-2">
            {dailyHabits.map((h) => {
              const on = doneToday.has(h.id);
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => tickHabit(board, send, h, TODAY, !on)}
                  className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] transition ${
                    on ? "border-ink bg-ink text-brand-cream" : "border-line bg-panel text-muted hover:border-ink/30"
                  }`}
                >
                  <span>{on ? "✓" : "○"}</span>
                  {h.name}
                </button>
              );
            })}
          </div>
        </Panel>
      ) : null}

      {freshIdeas.length ? (
        <Panel title="Just captured" right={<span className="text-[12px] text-muted">{freshIdeas.length} new</span>}>
          <div className="space-y-1">
            {freshIdeas.map((i) => (
              <IdeaRow key={i.id} idea={i} send={send} />
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function IdeaRow({ idea, send }: { idea: Idea; send: Send }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-none">
      <span className="min-w-0 flex-1 text-[14px]">
        {idea.title}
        {idea.link ? (
          <a href={idea.link} target="_blank" rel="noreferrer" className="ml-2 text-[12px] text-accent-2 underline">
            link
          </a>
        ) : null}
      </span>
      <span className="shrink-0 text-[11px] text-muted">{pretty(idea.captured)}</span>
      <button
        type="button"
        onClick={() =>
          send({ action: "ideaToTodo", id: idea.id, title: idea.title, link: idea.link }, (b) => ({
            ...b,
            ideas: b.ideas.map((i) => (i.id === idea.id ? { ...i, status: "Next Up" } : i)),
            todos: [
              ...b.todos,
              {
                id: `tmp-${Date.now()}`,
                title: idea.title,
                done: false,
                due: null,
                plan: null,
                category: null,
                priority: null,
                link: idea.link,
                source: "Manual",
              },
            ],
          }))
        }
        className="shrink-0 rounded-lg border border-line px-2 py-1 text-[12px] text-muted transition hover:border-ink/30 hover:text-ink"
      >
        → to-do
      </button>
      <button
        type="button"
        aria-label="Delete"
        onClick={() =>
          send({ action: "deleteIdea", id: idea.id }, (b) => ({ ...b, ideas: b.ideas.filter((i) => i.id !== idea.id) }))
        }
        className="shrink-0 text-[13px] text-muted/60 hover:text-bad"
      >
        ✕
      </button>
    </div>
  );
}

const IDEA_STATUSES = ["Inbox", "Next Up", "Making It", "Posted"];

function IdeasPane({ board, send }: { board: Board; send: Send }) {
  const [status, setStatus] = useState("Inbox");
  const shown = board.ideas.filter((i) => (i.status ?? "Inbox") === status);
  return (
    <Panel
      title="Content ideas"
      right={
        <Pills
          items={IDEA_STATUSES.map((s) => ({ id: s, label: s }))}
          value={status}
          onChange={setStatus}
        />
      }
    >
      <div className="space-y-1">
        {shown.length ? (
          shown.map((i) => (
            <div key={i.id} className="space-y-1">
              <IdeaRow idea={i} send={send} />
              <div className="flex gap-1 pb-2">
                {IDEA_STATUSES.filter((s) => s !== status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      send({ action: "ideaStatus", id: i.id, status: s }, (b) => ({
                        ...b,
                        ideas: b.ideas.map((x) => (x.id === i.id ? { ...x, status: s } : x)),
                      }))
                    }
                    className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted transition hover:border-ink/30 hover:text-ink"
                  >
                    move to {s}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="py-2 text-[14px] text-muted">
            Nothing in {status}. Say “Hey Siri, capture idea” and it lands here.
          </p>
        )}
      </div>
    </Panel>
  );
}

function TodosPane({ board, send }: { board: Board; send: Send }) {
  const [view, setView] = useState("list");
  const [cat, setCat] = useState("all");
  const days = monthDays();
  const cats = categoriesOf(board);
  const shown = cat === "all" ? board.todos : board.todos.filter((t) => groupOf(t, cats) === cat);

  return (
    <div className="space-y-4">
      <Panel
        title="To-dos"
        right={
          <Pills
            items={[
              { id: "list", label: "List" },
              { id: "calendar", label: "Month" },
            ]}
            value={view}
            onChange={setView}
          />
        }
      >
        <div className="space-y-4">
          <AddRow
            placeholder="Add a to-do…"
            onAdd={(title) =>
              send({ action: "addTodo", title, category: cat === "all" ? undefined : cat }, (b) => ({
                ...b,
                todos: [
                  ...b.todos,
                  {
                    id: `tmp-${Date.now()}`,
                    title,
                    done: false,
                    due: null,
                    plan: null,
                    category: cat === "all" ? null : cat,
                    priority: null,
                    link: null,
                    source: "Manual",
                  },
                ],
              }))
            }
          />
          <Pills
            items={[{ id: "all", label: "Everything" }, ...cats.map((c) => ({ id: c, label: c }))]}
            value={cat}
            onChange={setCat}
          />

          {view === "list" ? (
            <div>
              {(cat === "all" ? [...cats, NONE] : [cat]).map((group) => {
                const items = shown.filter((t) => groupOf(t, cats) === group);
                if (!items.length) return null;
                const done = items.filter((t) => t.done).length;
                return (
                  <div key={group} className="mb-4">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: catColour(group) }} />
                      <span className="text-[13px] font-medium">{group}</span>
                      <span className="text-[12px] text-muted">
                        {done}/{items.length}
                      </span>
                    </div>
                    {items.map((t) => (
                      <TodoRow key={t.id} todo={t} send={send} />
                    ))}
                  </div>
                );
              })}
              {shown.length === 0 ? <p className="text-[14px] text-muted">Nothing here yet.</p> : null}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {days.map((d) => {
                const items = shown.filter((t) => !t.done && (t.due === d || t.plan === d));
                return (
                  <div
                    key={d}
                    className={`min-h-[68px] rounded-xl border p-1.5 ${
                      d === TODAY ? "border-ink/40 bg-panel" : "border-line bg-panel-2"
                    }`}
                  >
                    <div className="mb-1 text-[10px] text-muted">{Number(d.slice(8))}</div>
                    {items.slice(0, 3).map((t) => (
                      <div
                        key={t.id}
                        title={t.title}
                        className="mb-0.5 truncate rounded px-1 text-[10px]"
                        style={{ background: `${catColour(t.category)}1f`, color: catColour(t.category) }}
                      >
                        {t.title}
                      </div>
                    ))}
                    {items.length > 3 ? <div className="text-[9px] text-muted">+{items.length - 3}</div> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function tickHabit(board: Board, send: Send, habit: Habit, date: string, on: boolean) {
  const existing = board.ticks.find((t) => t.habitId === habit.id && t.date === date);
  send(
    { action: "tickHabit", habitId: habit.id, habitName: habit.name, date, on, tickId: existing?.id },
    (b) => ({
      ...b,
      ticks: on
        ? [...b.ticks, { id: `tmp-${Date.now()}`, habitId: habit.id, date } as HabitTick]
        : b.ticks.filter((t) => !(t.habitId === habit.id && t.date === date)),
    }),
  );
}

function HabitsPane({ board, send }: { board: Board; send: Send }) {
  const [cadence, setCadence] = useState("Daily");
  const days = monthDays().filter((d) => d <= TODAY);
  const allDays = monthDays();
  const habits = board.habits.filter((h) => !h.bad && h.cadence === cadence);
  const bad = board.habits.filter((h) => h.bad);
  const isOn = (habitId: string, date: string) => board.ticks.some((t) => t.habitId === habitId && t.date === date);

  const total = habits.length * days.length;
  const hits = habits.reduce((n, h) => n + days.filter((d) => isOn(h.id, d)).length, 0);

  return (
    <div className="space-y-4">
      <Panel
        title="Habits"
        right={<span className="text-[12px] text-muted">{total ? Math.round((hits / total) * 100) : 0}% this month</span>}
      >
        <div className="space-y-4">
          <Pills items={CADENCES.map((c) => ({ id: c, label: c }))} value={cadence} onChange={setCadence} />

          {cadence === "Daily" ? (
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-x-[2px]">
                <thead>
                  <tr>
                    <th className="min-w-[130px] pb-1 text-left text-[11px] font-medium text-muted">Habit</th>
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
                      <td className="pr-2 text-[13px] whitespace-nowrap">{h.name}</td>
                      {allDays.map((d) => (
                        <td key={d} className="px-[1px] py-[2px]">
                          <div className="flex justify-center">
                            {d > TODAY ? (
                              <span className="block h-[22px] w-[22px] rounded-full border border-line/60 opacity-30" />
                            ) : (
                              <Tick
                                on={isOn(h.id, d)}
                                ring={d === TODAY}
                                onChange={(v) => tickHabit(board, send, h, d, v)}
                              />
                            )}
                          </div>
                        </td>
                      ))}
                      <td className="pl-2 text-right text-[11px] text-muted whitespace-nowrap">
                        {days.length ? Math.round((days.filter((d) => isOn(h.id, d)).length / days.length) * 100) : 0}%
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
                <div key={h.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-none">
                  <Box on={isOn(h.id, TODAY)} onChange={(v) => tickHabit(board, send, h, TODAY, v)} />
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

          {habits.length === 0 ? <p className="text-[14px] text-muted">No {cadence.toLowerCase()} habits yet.</p> : null}

          <AddRow
            placeholder={`New ${cadence.toLowerCase()} habit…`}
            onAdd={(name) =>
              send({ action: "addHabit", name, cadence, bad: false }, (b) => ({
                ...b,
                habits: [...b.habits, { id: `tmp-${Date.now()}`, name, cadence, bad: false }],
              }))
            }
          />
        </div>
      </Panel>

      <Panel title="Bad habits" right={<span className="text-[12px] text-muted">tick the days you slipped</span>}>
        <div className="space-y-4">
          {bad.map((h) => (
            <div key={h.id}>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[13px] font-medium text-bad">{h.name}</span>
                <span className="text-[11px] text-muted">
                  {board.ticks.filter((t) => t.habitId === h.id).length}× this month
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
                  <Box key={d} tone="bad" on={isOn(h.id, d)} onChange={(v) => tickHabit(board, send, h, d, v)} />
                ))}
              </div>
            </div>
          ))}
          <AddRow
            placeholder="Something you want to do less of…"
            onAdd={(name) =>
              send({ action: "addHabit", name, cadence: "Daily", bad: true }, (b) => ({
                ...b,
                habits: [...b.habits, { id: `tmp-${Date.now()}`, name, cadence: "Daily", bad: true }],
              }))
            }
          />
        </div>
      </Panel>
    </div>
  );
}

function GoalsPane({ board, send }: { board: Board; send: Send }) {
  const periods = useMemo(() => {
    const found = Array.from(new Set(board.goals.map((g) => g.period).filter(Boolean)));
    const now = new Date();
    const quarter = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
    return found.includes(quarter) ? found : [quarter, ...found];
  }, [board.goals]);
  const [period, setPeriod] = useState(periods[0]);
  const current = periods.includes(period) ? period : periods[0];

  return (
    <Panel
      title="Goals"
      right={<Pills items={periods.map((p) => ({ id: p, label: p }))} value={current} onChange={setPeriod} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {AREAS.map((area) => {
          const items = board.goals.filter((g) => g.area === area && g.period === current);
          const done = items.filter((g) => g.done).length;
          return (
            <div key={area} className="rounded-xl border border-line bg-panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-medium">{area}</span>
                <span className="text-[11px] text-muted">
                  {done}/{items.length}
                </span>
              </div>
              <div className="mb-2 space-y-1">
                {items.map((g: Goal) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <Box
                      on={g.done}
                      onChange={(v) =>
                        send({ action: "toggleGoal", id: g.id, done: v }, (b) => ({
                          ...b,
                          goals: b.goals.map((x) => (x.id === g.id ? { ...x, done: v } : x)),
                        }))
                      }
                    />
                    <span className={`flex-1 text-[13px] ${g.done ? "text-muted line-through" : ""}`}>{g.name}</span>
                    <button
                      type="button"
                      aria-label="Delete goal"
                      onClick={() =>
                        send({ action: "deleteGoal", id: g.id }, (b) => ({
                          ...b,
                          goals: b.goals.filter((x) => x.id !== g.id),
                        }))
                      }
                      className="text-[12px] text-muted/60 hover:text-bad"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {items.length === 0 ? <p className="text-[12px] text-muted">Nothing yet.</p> : null}
              </div>
              <AddRow
                placeholder="Add a goal…"
                onAdd={(name) =>
                  send({ action: "addGoal", name, area, period: current }, (b) => ({
                    ...b,
                    goals: [...b.goals, { id: `tmp-${Date.now()}`, name, area, period: current, done: false }],
                  }))
                }
              />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------- shell */

const TABS = [
  { id: "today", label: "Today" },
  { id: "ideas", label: "Ideas" },
  { id: "todos", label: "To-dos" },
  { id: "habits", label: "Habits" },
  { id: "goals", label: "Goals" },
];

export default function BoardApp({ initialKey, initialTodoDb }: { initialKey: string; initialTodoDb: string }) {
  const [captureKey, setCaptureKey] = useState(initialKey);
  const [todoDb, setTodoDb] = useState(initialTodoDb);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("today");

  // The dashboard is opened from a phone as often as a laptop, so the key is
  // remembered rather than needing the long link every time.
  useEffect(() => {
    if (initialKey) {
      localStorage.setItem("captureKey", initialKey);
      return;
    }
    const saved = localStorage.getItem("captureKey");
    if (saved) setCaptureKey(saved);
  }, [initialKey]);

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

  const boardUrl = useCallback(
    () => `/api/board?key=${encodeURIComponent(captureKey)}${todoDb ? `&todos=${encodeURIComponent(todoDb)}` : ""}`,
    [captureKey, todoDb],
  );

  const load = useCallback(async () => {
    if (!captureKey) return;
    setLoading(true);
    try {
      const res = await fetch(boardUrl());
      const json = (await res.json()) as { ok: boolean; error?: string } & Board;
      if (!json.ok) {
        setError(json.error ?? "Couldn't load your Notion.");
        return;
      }
      setError("");
      setBoard(json);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [captureKey, boardUrl]);

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
      const json = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!json?.ok) setError(json?.error ?? "That didn't save to Notion — reloading.");
      void load();
    })();
  };

  if (!captureKey) {
    return (
      <div className="board-theme">
        <div className="mx-auto max-w-md space-y-4 px-5 py-16">
          <h1 className="text-[30px] font-semibold tracking-tight">Your dashboard</h1>
          <p className="text-[15px] leading-relaxed text-muted">
            Paste your capture link (the long one ending in <span className="font-mono">?key=…</span>) and this becomes
            your Notion, in a layout you&apos;d actually look at.
          </p>
          <AddRow
            placeholder="https://…/api/capture?key=…"
            onAdd={(v) => {
              const key = v.includes("key=") ? decodeURIComponent(v.split("key=")[1]) : v.trim();
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
        <header className="mb-7 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold leading-none tracking-tight">Second brain</h1>
            <p className="mt-2 text-[13px] text-muted">
              Everything here is your Notion — Siri writes to it, this just makes it usable.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 rounded-xl border border-line bg-panel px-3 py-1.5 text-[13px] text-muted transition hover:border-ink/30 hover:text-ink"
          >
            {loading ? "Syncing…" : "Sync"}
          </button>
        </header>

        <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px shrink-0 border-b px-3.5 py-2.5 text-[14px] transition ${
                tab === t.id ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {error ? (
          <div className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-[14px]">{error}</div>
        ) : null}

        {!board ? (
          <p className="py-16 text-center text-[15px] text-muted">Reading your Notion…</p>
        ) : tab === "today" ? (
          <TodayPane board={board} send={send} />
        ) : tab === "ideas" ? (
          <IdeasPane board={board} send={send} />
        ) : tab === "todos" ? (
          <TodosPane board={board} send={send} />
        ) : tab === "habits" ? (
          <HabitsPane board={board} send={send} />
        ) : (
          <GoalsPane board={board} send={send} />
        )}
      </div>
    </div>
  );
}
