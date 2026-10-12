import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  Action,
  applyAction,
  ensureBoardDbs,
  ensureDayColumns,
  ensureDealLink,
  ensureDealMoney,
  ensureGoalColumns,
  ensureGoalLink,
  ensureIdeaNotes,
  ensureKindColumn,
  ensurePlanColumn,
  findDatabaseLike,
  memo,
  readBoard,
  readDealMap,
  readTaskMap,
  TaskMap,
} from "@/lib/board";
import { demoBoard } from "./demo";
import { humanizeNotionError } from "@/lib/notion";
import { resolveCredentials } from "@/lib/store";

export const runtime = "nodejs";

const NO_KEY = "This dashboard link isn't carrying working credentials. Open your capture link from the setup wizard again.";

/** ?todos=<database id> points the to-do side at a list the user already keeps,
 *  instead of the one the wizard made. Captures are unaffected either way. */
const todoDbOverride = (req: Request) => dbParam(req, "todos");

/** Same for ?ideas=<database id>, for a general ideas list kept outside the
 *  wizard's content database. */
const ideaDbOverride = (req: Request) => dbParam(req, "ideas");

const dbParam = (req: Request, name: string) => {
  const raw = new URL(req.url).searchParams.get(name)?.trim();
  return raw ? raw.replace(/-/g, "") : undefined;
};

/** The deals wall carries amounts and brand terms, so it stays behind a
 *  passcode even for someone holding the dashboard link. No passcode set on
 *  the deployment means nothing to hide. */
const dealsUnlocked = (req: Request) => {
  const code = process.env.DEALS_PASSCODE?.trim();
  if (!code) return true;
  return (req.headers.get("x-deals-code") ?? "").trim() === code;
};

const DEAL_ACTIONS = ["addDeal", "editDeal", "deleteDeal"];

/** The schema as it is, plus the columns the dashboard needs and a
 *  deadline-shaped tracker won't have. */
async function taskMap(
  token: string,
  taskDbId: string,
  goalsDbId: string,
  ideaDbId: string,
  dealsDbId: string,
): Promise<TaskMap> {
  const map = await readTaskMap(token, taskDbId);
  const dated = await ensureDayColumns(
    token,
    taskDbId,
    await ensureKindColumn(token, taskDbId, await ensurePlanColumn(token, taskDbId, map)),
  );
  await ensureGoalColumns(token, goalsDbId);
  await ensureIdeaNotes(token, ideaDbId);
  const linked = await ensureGoalLink(token, taskDbId, goalsDbId, dated);
  return ensureDealLink(token, taskDbId, dealsDbId, linked);
}

type Setup = Awaited<ReturnType<typeof loadSetup>>;
const setupMemo = memo<Setup>(10 * 60 * 1000);

async function loadSetup(token: string, ideaDbId: string, taskDbId: string) {
  const dbs = await ensureBoardDbs(token, ideaDbId, taskDbId);
  const map = await taskMap(token, dbs.task, dbs.goals, dbs.content, dbs.deals);
  const dealMap = await ensureDealMoney(token, dbs.deals, await readDealMap(token, dbs.deals));
  return { dbs, map, dealMap };
}

/** Database ids and column maps only change when someone edits the Notion
 *  schema, so they are remembered for a few minutes per workspace. */
async function setup(token: string, ideaDbId: string, taskDbId: string) {
  const tokenKey = createHash("sha256").update(token).digest("hex").slice(0, 16);
  const found = await setupMemo(`${tokenKey}:${ideaDbId}:${taskDbId}`, () =>
    loadSetup(token, ideaDbId, taskDbId),
  );
  // The email database may be shared after the rest was remembered; keep
  // looking for it on every load until it turns up.
  if (found.dbs.emails) return found;
  const emails = await findDatabaseLike(token, "grok bot tasks", /grok\s*bot/i).catch(() => null);
  return emails ? { ...found, dbs: { ...found.dbs, emails } } : found;
}

/** Everything the dashboard renders, in one round trip. */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key")?.trim() || undefined;
  // A filled-in dashboard nobody has to hand their Notion key to, for demos.
  if (key === "demo") return demoBoard();
  const creds = await resolveCredentials(key);
  if (!creds) return NextResponse.json({ ok: false, error: NO_KEY }, { status: 401 });

  // Habit ticks are only needed for the grid on screen, which is this month.
  const since = new Date();
  since.setUTCDate(1);

  const taskDbId = todoDbOverride(req) ?? creds.taskDbId;
  const ideaDbId = ideaDbOverride(req) ?? creds.contentDbId;

  try {
    const { dbs, map, dealMap } = await setup(creds.token, ideaDbId, taskDbId);
    const board = await readBoard(creds.token, dbs, map, dealMap, since.toISOString().slice(0, 10));
    if (!dealsUnlocked(req))
      return NextResponse.json({ ok: true, ...board, deals: [], dealsLocked: true, dbs });
    return NextResponse.json({ ok: true, ...board, dbs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: humanizeNotionError(e) }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const key = new URL(req.url).searchParams.get("key")?.trim() || undefined;
  if (key === "demo") return NextResponse.json({ ok: true });
  const creds = await resolveCredentials(key);
  if (!creds) return NextResponse.json({ ok: false, error: NO_KEY }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Action | null;
  if (!body?.action) return NextResponse.json({ ok: false, error: "No action given." }, { status: 400 });
  if (DEAL_ACTIONS.includes(body.action) && !dealsUnlocked(req))
    return NextResponse.json({ ok: false, error: "The deals are locked. Enter the passcode first." }, { status: 401 });

  const taskDbId = todoDbOverride(req) ?? creds.taskDbId;
  const ideaDbId = ideaDbOverride(req) ?? creds.contentDbId;

  try {
    const { dbs, map, dealMap } = await setup(creds.token, ideaDbId, taskDbId);
    await applyAction(creds.token, dbs, map, dealMap, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: humanizeNotionError(e) }, { status: 400 });
  }
}
