/**
 * The dashboard's data layer. Notion stays the only database so the iPhone
 * Shortcuts keep writing to exactly the same rows the dashboard renders — the
 * two extra databases (habits, goals) are found by title under the same parent
 * page and created on first use, which keeps the capture key format unchanged.
 */

const NOTION_VERSION = "2022-06-28";
const API = "https://api.notion.com/v1";

async function notion<T>(token: string, endpoint: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw {
      status: res.status,
      code: typeof body.code === "string" ? body.code : undefined,
      message: typeof body.message === "string" ? body.message : `Notion returned ${res.status}`,
    };
  }
  return body as T;
}

/* ------------------------------------------------------------------ shapes */

export type Todo = {
  id: string;
  title: string;
  done: boolean;
  due: string | null;
  plan: string | null;
  kind: "deadline" | "want" | null;
  // Which of the day's two piles a task was picked into: a deep block or a
  // quick thing to clear.
  slot: "deep" | "quick" | null;
  // Minutes actually spent, accumulated by the timer, so the day can be sized
  // from history instead of optimism.
  minutes: number | null;
  category: string | null;
  priority: string | null;
  link: string | null;
  source: string | null;
  // The goal this is work towards, if any — the rest is life admin.
  goal: string | null;
  // The brand deal this is owed to, if any.
  deal: string | null;
  url: string;
};

/** How long a finished task really took, kept for estimating the next one. */
export type Timing = { title: string; minutes: number };

/** A row in the database the Grok agent watches: the dashboard writes the job,
 *  the agent writes the result back into the same row. */
export type AgentTask = {
  id: string;
  title: string;
  details: string;
  due: string | null;
  status: string;
  result: string;
  url: string;
};

export type Idea = {
  id: string;
  title: string;
  notes: string;
  status: string | null;
  link: string | null;
  captured: string | null;
  url: string;
};

export type Habit = { id: string; name: string; cadence: string; bad: boolean; affirmation?: boolean };
export type HabitTick = { id: string; habitId: string; date: string };
/** Goals are one table at two heights: a quarter goal is the parent, and the
 *  month goals under it are what actually turn into tasks. */
export type Goal = {
  id: string;
  name: string;
  area: string;
  period: string;
  horizon: "month" | "quarter";
  parent: string | null;
  done: boolean;
};

/** A paid partnership from the first email to the money landing: the stage is
 *  the whole point, because an unpaid invoice is still an open deal. */
export type Deal = {
  id: string;
  brand: string;
  /** Where the work is: script, film, edit, post, delivered. */
  stage: string | null;
  /** Where the deal is: prospecting, signed, paid. */
  status: string | null;
  fee: number | null;
  due: string | null;
  contact: string;
  link: string | null;
  notes: string;
  invoiced: boolean | null;
  paid: boolean | null;
  /** The day the money actually landed, which is the only date earnings can
   *  honestly be counted by. */
  paidOn: string | null;
  /** True when the manager brokered it and takes their 20%. */
  cut: boolean | null;
  url: string;
};

export type DealField =
  | "brand"
  | "stage"
  | "status"
  | "fee"
  | "due"
  | "contact"
  | "link"
  | "notes"
  | "invoiced"
  | "paid"
  | "paidOn"
  | "cut";

/** A brand-deal tracker somebody keeps by hand has its own column names and
 *  its own list of stages, so every role is matched against the real schema
 *  rather than assumed. */
export type DealMap = {
  title: string;
  stage: { prop: string; kind: "select" | "status"; options: string[] } | null;
  status: { prop: string; kind: "select" | "status"; options: string[] } | null;
  fee: string | null;
  due: string | null;
  contact: string | null;
  link: string | null;
  notes: string | null;
  invoiced: string | null;
  paid: string | null;
  paidOn: string | null;
  cut: string | null;
};

export type Board = {
  todos: Todo[];
  agent: AgentTask[];
  ideas: Idea[];
  habits: Habit[];
  ticks: HabitTick[];
  goals: Goal[];
  deals: Deal[];
  dealStages: string[];
  /** Money is nobody else's business: true when the passcode hasn't been
   *  given, and the deals never left the server. */
  dealsLocked?: boolean;
  timings: Timing[];
  categories: string[];
  dbs: BoardDbs;
};

export type BoardDbs = {
  content: string;
  task: string;
  habits: string;
  ticks: string;
  goals: string;
  agent: string;
  deals: string;
};

export const CATEGORIES = ["Work", "Personal", "Health", "Money", "Other"];
export const AREAS = ["Business", "Content", "Health", "Life"];
export const CADENCES = ["Daily", "Weekly", "Monthly"];
/** A deal moves one way, and "Delivered" is not the same as "Paid". */
export const DEAL_STAGES = [
  "Pitched",
  "Negotiating",
  "Signed",
  "Filming",
  "Delivered",
  "Invoiced",
  "Paid",
];

/* ------------------------------------------------------- property plumbing */

type Prop = {
  type?: string;
  title?: { plain_text?: string }[];
  rich_text?: { plain_text?: string }[];
  checkbox?: boolean;
  date?: { start?: string } | null;
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  multi_select?: { name?: string }[];
  url?: string | null;
  number?: number | null;
  relation?: { id: string }[];
};

type Row = { id: string; url: string; created_time?: string; properties: Record<string, Prop> };

const textOf = (p?: Prop) =>
  (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim();
const dateOf = (p?: Prop) => p?.date?.start?.slice(0, 10) ?? null;
const selectOf = (p?: Prop) => p?.select?.name ?? null;
const tagOf = (p?: Prop) => p?.select?.name ?? p?.status?.name ?? p?.multi_select?.[0]?.name ?? null;

const title = (s: string) => ({ title: [{ type: "text", text: { content: s.slice(0, 1900) } }] });
const richText = (s: string) => ({ rich_text: [{ type: "text", text: { content: s.slice(0, 1900) } }] });
const dateProp = (s: string | null) => ({ date: s ? { start: s } : null });
const selectProp = (s: string | null) => ({ select: s ? { name: s } : null });
const relationProp = (id: string | null) => ({ relation: id ? [{ id }] : [] });
const relationOf = (p?: Prop) => p?.relation?.[0]?.id ?? null;

const kindOf = (r: Row, map: TaskMap): "deadline" | "want" | null => {
  if (!map.kindProp) return null;
  const v = selectOf(r.properties[map.kindProp.prop]);
  return v === map.kindProp.deadline ? "deadline" : v === map.kindProp.want ? "want" : null;
};

const slotOf = (r: Row, map: TaskMap): "deep" | "quick" | null => {
  if (!map.slotProp) return null;
  const v = selectOf(r.properties[map.slotProp.prop]);
  return v === map.slotProp.deep ? "deep" : v === map.slotProp.quick ? "quick" : null;
};

function selectSchema(options: string[], colors: string[]) {
  return { select: { options: options.map((name, i) => ({ name, color: colors[i % colors.length] })) } };
}

/* ------------------------------------------------- reading someone's schema */

/**
 * A to-do database can be the one the wizard built or one the user already
 * lived in for years, so nothing is addressed by a hard-coded column name:
 * each role is matched against the real schema once and everything else — the
 * reads, the writes, the category chips — works off that map.
 */
export type TaskMap = {
  title: string;
  done:
    | { prop: string; kind: "checkbox" }
    | { prop: string; kind: "status"; doneName: string; openName: string }
    | null;
  due: string | null;
  plan: string | null;
  // The column that says whether a date is a promise to somebody else or just
  // an intention, with the user's own wording for each.
  kindProp: { prop: string; deadline: string; want: string } | null;
  slotProp: { prop: string; deep: string; quick: string } | null;
  minutes: string | null;
  category: { prop: string; kind: "select" | "multi_select" } | null;
  categories: string[];
  priority: string | null;
  link: string | null;
  source: string | null;
  captured: string | null;
  goal: string | null;
  deal: string | null;
};

type SchemaProp = {
  name: string;
  type: string;
  select?: { options: { name: string }[] };
  multi_select?: { options: { name: string }[] };
  relation?: { database_id?: string };
  number?: object;
  status?: { options: { id: string; name: string }[]; groups: { name: string; option_ids: string[] }[] };
};

const DONE_NAMES = /^(done|complete|completed|finished)$/i;

function pick(props: SchemaProp[], type: string, match?: RegExp): SchemaProp | undefined {
  const ofType = props.filter((p) => p.type === type);
  return (match && ofType.find((p) => match.test(p.name))) || (match ? undefined : ofType[0]);
}

/** A status column stands in for the Done checkbox: whatever sits in Notion's
 *  "Complete" group means done, and the first "To-do" option means not. */
function statusDone(prop: SchemaProp): { doneName: string; openName: string } | null {
  const options = prop.status?.options ?? [];
  const groups = prop.status?.groups ?? [];
  const idsIn = (name: RegExp) => groups.find((g) => name.test(g.name))?.option_ids ?? [];
  const byId = (ids: string[]) => options.find((o) => ids.includes(o.id))?.name;
  const doneName = byId(idsIn(/complete|done/i)) ?? options.find((o) => DONE_NAMES.test(o.name))?.name;
  const openName = byId(idsIn(/to-?do|not started|backlog/i)) ?? options[0]?.name;
  if (!doneName || !openName) return null;
  return { doneName, openName };
}

/** Her tracker's stage list is the source of truth; DEAL_STAGES is only the
 *  fallback for a deals table this app had to create itself. */
export async function readDealMap(token: string, dealsDbId: string): Promise<DealMap> {
  const db = await notion<{ properties: Record<string, SchemaProp> }>(token, `/databases/${dealsDbId}`);
  const props = Object.entries(db.properties).map(([name, p]) => ({ ...p, name }));
  const optionsOf = (p: SchemaProp) =>
    ((p.type === "status" ? p.status?.options : p.select?.options) ?? []).map((o) => o.name);
  const choices = props.filter((p) => p.type === "select" || p.type === "status");
  // What she asks the dashboard is "do I have to script, film, edit or post
  // this?", so the production column wins over the negotiation one wherever a
  // tracker keeps both.
  const stageProp =
    choices.find((p) => /production|workflow|progress/i.test(p.name)) ??
    choices.find((p) => optionsOf(p).some((o) => /script|film|edit|post/i.test(o))) ??
    choices.find((p) => /stage|status/i.test(p.name)) ??
    choices[0];
  const statusProp = choices.find((p) => p.name !== stageProp?.name && /status|stage/i.test(p.name));
  const asRole = (p?: SchemaProp) =>
    p
      ? {
          prop: p.name,
          kind: (p.type === "status" ? "status" : "select") as "select" | "status",
          options: optionsOf(p),
        }
      : null;
  const checkbox = (match: RegExp) => pick(props, "checkbox", match)?.name ?? null;
  return {
    title: pick(props, "title")?.name ?? "Name",
    stage: asRole(stageProp),
    status: asRole(statusProp),
    fee: pick(props, "number", /amount|fee|rate|price|value|\$/i)?.name ?? pick(props, "number")?.name ?? null,
    due: pick(props, "date", /post|deliver|due|deadline|film/i)?.name ?? pick(props, "date")?.name ?? null,
    contact: pick(props, "rich_text", /contact|person|manager/i)?.name ?? null,
    link: pick(props, "url")?.name ?? null,
    notes: pick(props, "rich_text", /note|detail|deliverable/i)?.name ?? null,
    invoiced: checkbox(/invoice/i),
    paid: checkbox(/paid|payment received|received/i),
    paidOn: pick(props, "date", /payment|paid/i)?.name ?? null,
    cut: checkbox(/manager|commission|agency/i),
  };
}

export async function readTaskMap(token: string, taskDbId: string): Promise<TaskMap> {
  const db = await notion<{ properties: Record<string, SchemaProp> }>(token, `/databases/${taskDbId}`);
  const props = Object.entries(db.properties).map(([name, p]) => ({ ...p, name }));

  const checkbox = pick(props, "checkbox", /done|complete/i);
  const status = pick(props, "status");
  const statusPair = status ? statusDone(status) : null;
  const kindProp = props.find((p) => p.type === "select" && /^kind$/i.test(p.name.trim()));
  const slotProp = props.find((p) => p.type === "select" && /^slot$/i.test(p.name.trim()));
  const slotOptions = slotProp?.select?.options ?? [];
  const slotDeep = slotOptions.find((o) => /deep|focus|big/i.test(o.name))?.name;
  const slotQuick = slotOptions.find((o) => /quick|batch|small|admin/i.test(o.name))?.name;
  const kindOptions = kindProp?.select?.options ?? [];
  const kindDeadline = kindOptions.find((o) => /dead ?line|hard|must/i.test(o.name))?.name;
  const kindWant = kindOptions.find((o) => /want|wish|maybe|optional|like/i.test(o.name))?.name;
  const category =
    pick(props, "multi_select", /category|type|area|tag|bucket/i) ??
    pick(props, "select", /category|area|bucket/i) ??
    pick(props, "multi_select");
  const dates = props.filter((p) => p.type === "date");

  return {
    title: pick(props, "title")?.name ?? "Name",
    done: checkbox
      ? { prop: checkbox.name, kind: "checkbox" }
      : status && statusPair
        ? { prop: status.name, kind: "status", ...statusPair }
        : null,
    due: (dates.find((p) => /due|date/i.test(p.name)) ?? dates[0])?.name ?? null,
    plan: dates.find((p) => /plan|scheduled/i.test(p.name))?.name ?? null,
    kindProp:
      kindProp && kindDeadline && kindWant
        ? { prop: kindProp.name, deadline: kindDeadline, want: kindWant }
        : null,
    slotProp:
      slotProp && slotDeep && slotQuick ? { prop: slotProp.name, deep: slotDeep, quick: slotQuick } : null,
    minutes: props.find((p) => p.type === "number" && /minutes|time spent|duration/i.test(p.name))?.name ?? null,
    category: category ? { prop: category.name, kind: category.type as "select" | "multi_select" } : null,
    categories: (category?.select?.options ?? category?.multi_select?.options ?? []).map((o) => o.name),
    priority: pick(props, "select", /priority/i)?.name ?? null,
    link: pick(props, "url")?.name ?? null,
    source: pick(props, "select", /source/i)?.name ?? null,
    captured: dates.find((p) => /captured|created/i.test(p.name))?.name ?? null,
    goal: pick(props, "relation", /goal/i)?.name ?? null,
    deal: pick(props, "relation", /deal|brand/i)?.name ?? null,
  };
}

/** A deadline and "the day I want to do this" are different dates, and a
 *  tracker built around deadlines only has the first one. */
export async function ensurePlanColumn(token: string, taskDbId: string, map: TaskMap): Promise<TaskMap> {
  if (map.plan) return map;
  await notion(token, `/databases/${taskDbId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { Plan: { date: {} } } }),
  });
  return { ...map, plan: "Plan" };
}

/** Whether a task is owed to somebody or just wanted isn't a date or a
 *  category, so it gets its own column. */
export async function ensureKindColumn(token: string, taskDbId: string, map: TaskMap): Promise<TaskMap> {
  if (map.kindProp) return map;
  const deadline = "Deadline";
  const want = "Want to do";
  await notion(token, `/databases/${taskDbId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { Kind: selectSchema([deadline, want], ["red", "blue"]) } }),
  });
  return { ...map, kindProp: { prop: "Kind", deadline, want } };
}

/** The day is picked into a few deep blocks and a few quick ones, and the
 *  timer needs somewhere to leave how long each really took. */
export async function ensureDayColumns(token: string, taskDbId: string, map: TaskMap): Promise<TaskMap> {
  const properties: Record<string, object> = {};
  if (!map.slotProp) properties.Slot = selectSchema(["Deep", "Quick"], ["brown", "purple"]);
  if (!map.minutes) properties.Minutes = { number: { format: "number" } };
  if (!Object.keys(properties).length) return map;
  await notion(token, `/databases/${taskDbId}`, { method: "PATCH", body: JSON.stringify({ properties }) });
  return {
    ...map,
    slotProp: map.slotProp ?? { prop: "Slot", deep: "Deep", quick: "Quick" },
    minutes: map.minutes ?? "Minutes",
  };
}

/** A month goal is only real once the work under it is visible, which needs
 *  the tracker to point at the goals table. */
export async function ensureGoalLink(
  token: string,
  taskDbId: string,
  goalsDbId: string,
  map: TaskMap,
): Promise<TaskMap> {
  if (map.goal) return map;
  await notion(token, `/databases/${taskDbId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Goal: { relation: { database_id: goalsDbId, type: "dual_property", dual_property: {} } },
      },
    }),
  });
  return { ...map, goal: "Goal" };
}

/** A deal's to-dos only roll up under it once the tracker points at the deals
 *  table. */
export async function ensureDealLink(
  token: string,
  taskDbId: string,
  dealsDbId: string,
  map: TaskMap,
): Promise<TaskMap> {
  if (map.deal) {
    const db = await notion<{ properties: Record<string, SchemaProp> }>(token, `/databases/${taskDbId}`);
    const target = db.properties[map.deal]?.relation?.database_id ?? "";
    // A relation left pointing at an older deals table would quietly hide the
    // deal's to-dos, so it's rebuilt against the table actually in use.
    if (target.replace(/-/g, "") === dealsDbId.replace(/-/g, "")) return map;
    await notion(token, `/databases/${taskDbId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { [map.deal]: null } }),
    });
  }
  await notion(token, `/databases/${taskDbId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Deal: { relation: { database_id: dealsDbId, type: "dual_property", dual_property: {} } },
      },
    }),
  });
  return { ...map, deal: "Deal" };
}

/** A goals table from before quarters existed has neither a height nor a
 *  parent, and both are what make a month's goals roll up. */
export async function ensureGoalColumns(token: string, goalsDbId: string): Promise<void> {
  const db = await notion<{ properties: Record<string, SchemaProp> }>(token, `/databases/${goalsDbId}`);
  const missing: Record<string, object> = {};
  if (!db.properties.Horizon) missing.Horizon = selectSchema(["Month", "Quarter"], ["blue", "purple"]);
  if (!db.properties.Parent)
    missing.Parent = { relation: { database_id: goalsDbId, type: "dual_property", dual_property: {} } };
  if (!Object.keys(missing).length) return;
  await notion(token, `/databases/${goalsDbId}`, { method: "PATCH", body: JSON.stringify({ properties: missing }) });
}

/** An idea is a title until there's somewhere to write the rest of it. */
export async function ensureIdeaNotes(token: string, ideaDbId: string): Promise<void> {
  const db = await notion<{ properties: Record<string, SchemaProp> }>(token, `/databases/${ideaDbId}`);
  if (db.properties.Notes) return;
  await notion(token, `/databases/${ideaDbId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { Notes: { rich_text: {} } } }),
  });
}

/* --------------------------------------------------------- database lookup */

const HABIT_DB = "Habits";
const TICK_DB = "Habit Log";
const GOAL_DB = "Goals";
const AGENT_DB = "Assistant Tasks";
const DEAL_DB = "Brand Deals";
const AGENT_DB_LEGACY = "Agent Tasks";

export const AGENT_STATUSES = ["Queued", "Working", "Done", "Failed"];

/** A tracker somebody named "\u{1F4B0} Brand Deals \u2014 Tracker" is still the brand deals
 *  table, so the deals side matches on the words rather than the exact name. */
async function findDatabaseLike(token: string, query: string, match: RegExp): Promise<string | null> {
  const res = await notion<{ results: { id: string; title?: { plain_text?: string }[] }[] }>(token, "/search", {
    method: "POST",
    body: JSON.stringify({ query, filter: { value: "database", property: "object" }, page_size: 20 }),
  });
  const found = res.results.find((d) => match.test((d.title ?? []).map((t) => t.plain_text ?? "").join("")));
  return found?.id ?? null;
}

async function findDatabase(token: string, name: string): Promise<string | null> {
  const res = await notion<{ results: { id: string; title?: { plain_text?: string }[] }[] }>(token, "/search", {
    method: "POST",
    body: JSON.stringify({ query: name, filter: { value: "database", property: "object" }, page_size: 20 }),
  });
  const match = res.results.find(
    (d) => (d.title ?? []).map((t) => t.plain_text ?? "").join("").trim().toLowerCase() === name.toLowerCase(),
  );
  return match?.id ?? null;
}

/** Notion's search index lags a few minutes behind a database being created,
 *  so the page's own children are the only trustworthy answer to "does this
 *  already exist" — without it every visit makes another copy. */
async function childDatabases(token: string, parentPageId: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await notion<{
      results: { id: string; type?: string; child_database?: { title?: string } }[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(token, `/blocks/${parentPageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    for (const block of res.results) {
      const name = block.child_database?.title?.trim().toLowerCase();
      if (name && !found.has(name)) found.set(name, block.id);
    }
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return found;
}

/** Habits and goals are created beside whichever of the user's databases lives
 *  in a page — a top-level database has no page to hang them off. */
async function parentPageOf(token: string, databaseIds: string[]): Promise<string> {
  for (const id of databaseIds) {
    const db = await notion<{ parent?: { page_id?: string } }>(token, `/databases/${id}`);
    if (db.parent?.page_id) return db.parent.page_id;
  }
  throw {
    status: 400,
    message: "None of your databases sit inside a Notion page, so there's nowhere to put the habits and goals ones.",
  };
}

async function createDatabase(token: string, parentPageId: string, name: string, emoji: string, properties: object) {
  const db = await notion<{ id: string }>(token, "/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentPageId },
      icon: { type: "emoji", emoji },
      title: [{ type: "text", text: { content: name } }],
      properties,
    }),
  });
  return db.id;
}

/** The wizard's own To-dos database gains the two columns the dashboard adds;
 *  a database the user built themselves is left exactly as they made it. */
async function ensureTaskColumns(token: string, taskDbId: string) {
  const db = await notion<{ properties: Record<string, unknown> }>(token, `/databases/${taskDbId}`);
  if (!db.properties.Task || !db.properties.Done) return;
  const missing: Record<string, unknown> = {};
  if (!db.properties.Plan) missing.Plan = { date: {} };
  if (!db.properties.Category)
    missing.Category = selectSchema(CATEGORIES, ["blue", "green", "orange", "pink", "gray"]);
  if (Object.keys(missing).length === 0) return;
  await notion(token, `/databases/${taskDbId}`, { method: "PATCH", body: JSON.stringify({ properties: missing }) });
}

export async function ensureBoardDbs(token: string, contentDbId: string, taskDbId: string): Promise<BoardDbs> {
  await ensureTaskColumns(token, taskDbId);

  const [foundHabits, foundTicks, foundGoals, foundAgent, foundDeals] = await Promise.all([
    findDatabase(token, HABIT_DB),
    findDatabase(token, TICK_DB),
    findDatabase(token, GOAL_DB),
    findDatabase(token, AGENT_DB).then((id) => id ?? findDatabase(token, AGENT_DB_LEGACY)),
    findDatabaseLike(token, "brand deals", /brand\s*deals?/i),
  ]);
  if (foundHabits && foundTicks && foundGoals && foundAgent && foundDeals)
    return {
      content: contentDbId,
      task: taskDbId,
      habits: foundHabits,
      ticks: foundTicks,
      goals: foundGoals,
      agent: foundAgent,
      deals: foundDeals,
    };

  const parent = await parentPageOf(token, [taskDbId, contentDbId]);
  const onPage = await childDatabases(token, parent);
  const existing = (name: string) => onPage.get(name.toLowerCase()) ?? null;
  const habits =
    foundHabits ??
    existing(HABIT_DB) ??
    (await createDatabase(token, parent, HABIT_DB, "\u{1F525}", {
      Habit: { title: {} },
      Cadence: selectSchema(CADENCES, ["green", "blue", "purple"]),
      Kind: selectSchema(["Habit", "Bad habit", "Affirmation"], ["green", "red", "purple"]),
      Archived: { checkbox: {} },
    }));
  const ticks =
    foundTicks ??
    existing(TICK_DB) ??
    (await createDatabase(token, parent, TICK_DB, "\u{2714}\u{FE0F}", {
      Entry: { title: {} },
      HabitId: { rich_text: {} },
      Date: { date: {} },
    }));
  const goals =
    foundGoals ??
    existing(GOAL_DB) ??
    (await createDatabase(token, parent, GOAL_DB, "\u{1F3AF}", {
      Goal: { title: {} },
      Area: selectSchema(AREAS, ["blue", "orange", "green", "purple"]),
      Period: { rich_text: {} },
      Horizon: selectSchema(["Month", "Quarter"], ["blue", "purple"]),
      Done: { checkbox: {} },
    }));
  const agent =
    foundAgent ??
    existing(AGENT_DB) ??
    existing(AGENT_DB_LEGACY) ??
    (await createDatabase(token, parent, AGENT_DB, "\u{1F916}", {
      Task: { title: {} },
      Details: { rich_text: {} },
      Due: { date: {} },
      Status: selectSchema(AGENT_STATUSES, ["gray", "blue", "green", "red"]),
      Result: { rich_text: {} },
      From: { url: {} },
    }));
  const deals =
    foundDeals ??
    existing(DEAL_DB) ??
    (await createDatabase(token, parent, DEAL_DB, "\u{1F91D}", {
      Brand: { title: {} },
      Stage: selectSchema(DEAL_STAGES, [
        "gray",
        "yellow",
        "blue",
        "purple",
        "orange",
        "pink",
        "green",
      ]),
      Fee: { number: { format: "dollar" } },
      Due: { date: {} },
      Contact: { rich_text: {} },
      Link: { url: {} },
      Notes: { rich_text: {} },
    }));
  return { content: contentDbId, task: taskDbId, habits, ticks, goals, agent, deals };
}

/* --------------------------------------------------------------- the reads */

/** Notion pages at 100 rows and a lived-in tracker has more than that. */
async function query(token: string, dbId: string, body: object = {}, maxPages = 4): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const res = await notion<{ results: Row[]; has_more?: boolean; next_cursor?: string | null }>(
      token,
      `/databases/${dbId}/query`,
      { method: "POST", body: JSON.stringify({ page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) }) },
    );
    rows.push(...res.results);
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return rows;
}

/** Field names differ between a database the wizard built and one someone made
 *  by hand, so the title column is whichever one Notion marks as the title. */
function titleOf(row: Row): string {
  for (const prop of Object.values(row.properties)) if (prop.type === "title") return textOf(prop);
  return "";
}

export async function readBoard(
  token: string,
  dbs: BoardDbs,
  map: TaskMap,
  deals: DealMap,
  since: string,
): Promise<Omit<Board, "dbs">> {
  const doneOf = (r: Row) => {
    if (!map.done) return false;
    const p = r.properties[map.done.prop];
    return map.done.kind === "checkbox" ? (p?.checkbox ?? false) : p?.status?.name === map.done.doneName;
  };

  // A years-old tracker holds hundreds of finished rows; only the open ones and
  // whatever was touched recently are worth sending to the browser.
  const openFilter = map.done
    ? {
        or: [
          map.done.kind === "checkbox"
            ? { property: map.done.prop, checkbox: { equals: false } }
            : { property: map.done.prop, status: { does_not_equal: map.done.doneName } },
          { timestamp: "last_edited_time", last_edited_time: { on_or_after: since } },
        ],
      }
    : undefined;

  // Every row that was ever timed, however old, because an estimate is only
  // as good as the history behind it.
  const timedQuery = map.minutes
    ? query(token, dbs.task, {
        filter: { property: map.minutes, number: { greater_than: 0 } },
        page_size: 100,
      })
    : Promise.resolve([] as Row[]);

  const [todoRows, ideaRows, habitRows, tickRows, goalRows, agentRows, dealRows, timedRows] = await Promise.all([
    query(token, dbs.task, openFilter ? { filter: openFilter } : {}),
    query(token, dbs.content, { page_size: 60, sorts: [{ timestamp: "created_time", direction: "descending" }] }),
    query(token, dbs.habits),
    query(token, dbs.ticks, { filter: { property: "Date", date: { on_or_after: since } } }),
    query(token, dbs.goals),
    query(token, dbs.agent, { page_size: 60, sorts: [{ timestamp: "created_time", direction: "descending" }] }),
    query(token, dbs.deals, { page_size: 100 }),
    timedQuery,
  ]);

  return {
    categories: map.categories,
    timings: map.minutes
      ? timedRows
          .map((r) => ({ title: titleOf(r), minutes: r.properties[map.minutes as string]?.number ?? 0 }))
          .filter((t) => t.title && t.minutes > 0)
      : [],
    todos: todoRows.map((r) => ({
      id: r.id,
      title: titleOf(r),
      done: doneOf(r),
      due: map.due ? dateOf(r.properties[map.due]) : null,
      plan: map.plan ? dateOf(r.properties[map.plan]) : null,
      kind: kindOf(r, map),
      slot: slotOf(r, map),
      minutes: map.minutes ? (r.properties[map.minutes]?.number ?? null) : null,
      category: map.category ? tagOf(r.properties[map.category.prop]) : null,
      priority: map.priority ? selectOf(r.properties[map.priority]) : null,
      link: map.link ? (r.properties[map.link]?.url ?? null) : null,
      source: map.source ? selectOf(r.properties[map.source]) : null,
      goal: map.goal ? relationOf(r.properties[map.goal]) : null,
      deal: map.deal ? relationOf(r.properties[map.deal]) : null,
      url: r.url,
    })),
    agent: agentRows.map((r) => ({
      id: r.id,
      title: titleOf(r),
      details: textOf(r.properties.Details),
      due: dateOf(r.properties.Due),
      status: selectOf(r.properties.Status) ?? AGENT_STATUSES[0],
      result: textOf(r.properties.Result),
      url: r.url,
    })),
    // An ideas list someone already keeps won't have the wizard's columns, so
    // everything past the title is read only if it happens to be there.
    ideas: ideaRows.map((r) => ({
      id: r.id,
      title: titleOf(r),
      notes: textOf(r.properties.Notes),
      status: tagOf(r.properties.Status),
      link: r.properties.Link?.url ?? r.properties.URL?.url ?? null,
      captured: dateOf(r.properties.Captured) ?? r.created_time?.slice(0, 10) ?? null,
      url: r.url,
    })),
    habits: habitRows
      .filter((r) => !r.properties.Archived?.checkbox)
      .map((r) => ({
        id: r.id,
        name: titleOf(r),
        cadence: selectOf(r.properties.Cadence) ?? "Daily",
        bad: selectOf(r.properties.Kind) === "Bad habit",
        affirmation: selectOf(r.properties.Kind) === "Affirmation",
      })),
    ticks: tickRows.map((r) => ({
      id: r.id,
      habitId: textOf(r.properties.HabitId),
      date: dateOf(r.properties.Date) ?? "",
    })),
    goals: goalRows.map((r) => ({
      id: r.id,
      name: titleOf(r),
      area: selectOf(r.properties.Area) ?? AREAS[0],
      period: textOf(r.properties.Period),
      horizon: selectOf(r.properties.Horizon) === "Quarter" ? "quarter" : "month",
      parent: relationOf(r.properties.Parent),
      done: r.properties.Done?.checkbox ?? false,
    })),
    dealStages: deals.stage?.options.length ? deals.stage.options : DEAL_STAGES,
    deals: dealRows.map((r) => ({
      id: r.id,
      brand: titleOf(r),
      stage: deals.stage ? tagOf(r.properties[deals.stage.prop]) : null,
      status: deals.status ? tagOf(r.properties[deals.status.prop]) : null,
      fee: deals.fee ? (r.properties[deals.fee]?.number ?? null) : null,
      due: deals.due ? dateOf(r.properties[deals.due]) : null,
      contact: deals.contact ? textOf(r.properties[deals.contact]) : "",
      link: deals.link ? (r.properties[deals.link]?.url ?? null) : null,
      notes: deals.notes ? textOf(r.properties[deals.notes]) : "",
      invoiced: deals.invoiced ? (r.properties[deals.invoiced]?.checkbox ?? false) : null,
      paid: deals.paid ? (r.properties[deals.paid]?.checkbox ?? false) : null,
      paidOn: deals.paidOn ? dateOf(r.properties[deals.paidOn]) : null,
      cut: deals.cut ? (r.properties[deals.cut]?.checkbox ?? false) : null,
      url: r.url,
    })),
  };
}

/* ------------------------------------------------------------- the writes */

async function createPage(token: string, dbId: string, properties: object): Promise<string> {
  const page = await notion<{ id: string }>(token, "/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });
  return page.id;
}

async function updatePage(token: string, pageId: string, properties: object) {
  await notion(token, `/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ properties }) });
}

async function archivePage(token: string, pageId: string) {
  await notion(token, `/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
}

export type Action =
  | {
      action: "addTodo";
      title: string;
      category?: string;
      due?: string | null;
      plan?: string | null;
      kind?: "deadline" | "want" | null;
      slot?: "deep" | "quick" | null;
      goal?: string | null;
      deal?: string | null;
    }
  | {
      action: "editTodo";
      id: string;
      field: "title" | "due" | "plan" | "category" | "kind" | "slot" | "minutes" | "goal" | "deal";
      value: string | null;
    }
  | { action: "toggleTodo"; id: string; done: boolean }
  | { action: "deleteTodo"; id: string }
  | { action: "sendToAgent"; title: string; details?: string; due?: string | null; from?: string | null }
  | { action: "agentStatus"; id: string; status: string }
  | { action: "deleteAgent"; id: string }
  | { action: "ideaStatus"; id: string; status: string }
  | { action: "editIdea"; id: string; title?: string; notes?: string }
  | { action: "ideaToTodo"; id: string; title: string; link?: string | null; plan?: string | null }
  | { action: "deleteIdea"; id: string }
  | { action: "addHabit"; name: string; cadence: string; bad: boolean; affirmation?: boolean }
  | { action: "deleteHabit"; id: string }
  | { action: "tickHabit"; habitId: string; habitName: string; date: string; on: boolean; tickId?: string }
  | {
      action: "addGoal";
      name: string;
      area: string;
      period: string;
      horizon?: "month" | "quarter";
      parent?: string | null;
    }
  | { action: "toggleGoal"; id: string; done: boolean }
  | { action: "deleteGoal"; id: string }
  | {
      action: "addDeal";
      brand: string;
      stage?: string;
      fee?: number | null;
      due?: string | null;
      contact?: string;
      link?: string | null;
    }
  | {
      action: "editDeal";
      id: string;
      field: DealField;
      value: string | null;
    }
  | { action: "deleteDeal"; id: string };

/** Only writes columns the database actually has, so the same action works on
 *  the wizard's To-dos and on a tracker somebody built years ago. */
function taskProps(
  map: TaskMap,
  fields: {
    title?: string;
    done?: boolean;
    due?: string | null;
    plan?: string | null;
    kind?: "deadline" | "want" | null;
    slot?: "deep" | "quick" | null;
    minutes?: number | null;
    category?: string | null;
    link?: string | null;
    source?: string;
    goal?: string | null;
    deal?: string | null;
  },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (fields.title !== undefined) out[map.title] = title(fields.title);
  if (fields.done !== undefined && map.done)
    out[map.done.prop] =
      map.done.kind === "checkbox"
        ? { checkbox: fields.done }
        : { status: { name: fields.done ? map.done.doneName : map.done.openName } };
  if (fields.due !== undefined && map.due) out[map.due] = dateProp(fields.due);
  if (fields.plan !== undefined && map.plan) out[map.plan] = dateProp(fields.plan);
  if (fields.kind !== undefined && map.kindProp)
    out[map.kindProp.prop] = selectProp(
      fields.kind === "deadline" ? map.kindProp.deadline : fields.kind === "want" ? map.kindProp.want : null,
    );
  if (fields.slot !== undefined && map.slotProp)
    out[map.slotProp.prop] = selectProp(
      fields.slot === "deep" ? map.slotProp.deep : fields.slot === "quick" ? map.slotProp.quick : null,
    );
  if (fields.minutes !== undefined && map.minutes) out[map.minutes] = { number: fields.minutes };
  if (fields.category !== undefined && map.category && (!fields.category || map.categories.includes(fields.category)))
    out[map.category.prop] =
      map.category.kind === "multi_select"
        ? { multi_select: fields.category ? [{ name: fields.category }] : [] }
        : selectProp(fields.category);
  if (fields.goal !== undefined && map.goal) out[map.goal] = relationProp(fields.goal);
  if (fields.deal !== undefined && map.deal) out[map.deal] = relationProp(fields.deal);
  if (fields.link && map.link) out[map.link] = { url: fields.link };
  if (fields.source && map.source) out[map.source] = selectProp(fields.source);
  if (fields.title !== undefined && map.captured)
    out[map.captured] = dateProp(new Date().toISOString().slice(0, 10));
  return out;
}

/** Writes only the columns her deals table actually has, under its own names. */
function dealProps(
  deals: DealMap,
  field: DealField,
  value: string | null,
): Record<string, unknown> {
  const choice = (role: DealMap["stage"]) =>
    role
      ? { [role.prop]: role.kind === "status" ? { status: value ? { name: value } : null } : selectProp(value) }
      : {};
  switch (field) {
    case "brand":
      return { [deals.title]: title(value ?? "") };
    case "stage":
      return choice(deals.stage);
    case "status":
      return choice(deals.status);
    case "fee":
      return deals.fee ? { [deals.fee]: { number: value === null ? null : Number(value) || 0 } } : {};
    case "due":
      return deals.due ? { [deals.due]: dateProp(value) } : {};
    case "contact":
      return deals.contact ? { [deals.contact]: richText(value ?? "") } : {};
    case "link":
      return deals.link ? { [deals.link]: { url: value || null } } : {};
    case "notes":
      return deals.notes ? { [deals.notes]: richText(value ?? "") } : {};
    case "invoiced":
      return deals.invoiced ? { [deals.invoiced]: { checkbox: value === "on" } } : {};
    case "paid":
      return deals.paid ? { [deals.paid]: { checkbox: value === "on" } } : {};
    case "paidOn":
      return deals.paidOn ? { [deals.paidOn]: dateProp(value) } : {};
    case "cut":
      return deals.cut ? { [deals.cut]: { checkbox: value === "on" } } : {};
  }
}

export async function applyAction(token: string, dbs: BoardDbs, map: TaskMap, deals: DealMap, body: Action): Promise<void> {
  switch (body.action) {
    case "addTodo":
      await createPage(
        token,
        dbs.task,
        taskProps(map, {
          title: body.title,
          done: false,
          due: body.due ?? null,
          plan: body.plan ?? null,
          kind: body.kind ?? null,
          slot: body.slot ?? null,
          goal: body.goal ?? null,
          deal: body.deal ?? null,
          category: body.category ?? null,
          source: "Manual",
        }),
      );
      return;
    case "editTodo": {
      const value = body.value || null;
      const fields = {
        title: { title: value ?? "" },
        due: { due: value },
        plan: { plan: value },
        kind: { kind: (value === "deadline" || value === "want" ? value : null) as "deadline" | "want" | null },
        slot: { slot: (value === "deep" || value === "quick" ? value : null) as "deep" | "quick" | null },
        minutes: { minutes: value === null ? null : Number(value) || 0 },
        category: { category: value },
        goal: { goal: value },
        deal: { deal: value },
      }[body.field];
      await updatePage(token, body.id, taskProps(map, fields));
      return;
    }
    case "toggleTodo":
      await updatePage(token, body.id, taskProps(map, { done: body.done }));
      return;
    case "sendToAgent":
      await createPage(token, dbs.agent, {
        Task: title(body.title),
        Details: richText(body.details ?? ""),
        Due: dateProp(body.due ?? null),
        Status: selectProp(AGENT_STATUSES[0]),
        Result: richText(""),
        From: { url: body.from || null },
      });
      return;
    case "agentStatus":
      await updatePage(token, body.id, { Status: selectProp(body.status) });
      return;
    case "deleteDeal":
    case "deleteAgent":
    case "deleteTodo":
    case "deleteIdea":
    case "deleteHabit":
    case "deleteGoal":
      await archivePage(token, body.id);
      return;
    case "ideaStatus":
      await updatePage(token, body.id, { Status: selectProp(body.status) });
      return;
    case "editIdea": {
      const props: Record<string, unknown> = {};
      if (body.notes !== undefined) props.Notes = richText(body.notes);
      if (body.title !== undefined) {
        const page = await notion<Row>(token, `/pages/${body.id}`);
        const key = Object.entries(page.properties).find(([, p]) => p.type === "title")?.[0];
        if (key) props[key] = title(body.title);
      }
      if (Object.keys(props).length) await updatePage(token, body.id, props);
      return;
    }
    case "ideaToTodo":
      await createPage(
        token,
        dbs.task,
        taskProps(map, {
          title: body.title,
          done: false,
          plan: body.plan ?? null,
          kind: "want",
          link: body.link ?? null,
          source: "Manual",
        }),
      );
      await updatePage(token, body.id, { Status: selectProp("Next Up") });
      return;
    case "addHabit":
      await createPage(token, dbs.habits, {
        Habit: title(body.name),
        Cadence: selectProp(body.cadence),
        Kind: selectProp(body.affirmation ? "Affirmation" : body.bad ? "Bad habit" : "Habit"),
        Archived: { checkbox: false },
      });
      return;
    case "tickHabit":
      if (body.on) {
        await createPage(token, dbs.ticks, {
          Entry: title(`${body.habitName} — ${body.date}`),
          HabitId: richText(body.habitId),
          Date: dateProp(body.date),
        });
      } else if (body.tickId) {
        await archivePage(token, body.tickId);
      }
      return;
    case "addGoal":
      await createPage(token, dbs.goals, {
        Goal: title(body.name),
        Area: selectProp(body.area),
        Period: richText(body.period),
        Horizon: selectProp(body.horizon === "quarter" ? "Quarter" : "Month"),
        ...(body.parent ? { Parent: relationProp(body.parent) } : {}),
        Done: { checkbox: false },
      });
      return;
    case "toggleGoal":
      await updatePage(token, body.id, { Done: { checkbox: body.done } });
      return;
    case "addDeal":
      await createPage(token, dbs.deals, {
        ...dealProps(deals, "brand", body.brand),
        ...dealProps(deals, "stage", body.stage ?? deals.stage?.options[0] ?? DEAL_STAGES[0]),
        ...(body.fee === undefined || body.fee === null ? {} : dealProps(deals, "fee", String(body.fee))),
        ...(body.due ? dealProps(deals, "due", body.due) : {}),
        ...(body.contact ? dealProps(deals, "contact", body.contact) : {}),
        ...(body.link ? dealProps(deals, "link", body.link) : {}),
        // Everything signed from here on goes through the manager, so a new
        // deal starts with their 20% assumed and can be unticked on the card.
        ...dealProps(deals, "cut", "on"),
      });
      return;
    case "editDeal": {
      const props = dealProps(deals, body.field, body.value);
      if (Object.keys(props).length) await updatePage(token, body.id, props);
      return;
    }
  }
}
