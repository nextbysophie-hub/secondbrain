import { NextResponse } from "next/server";
import {
  Action,
  applyAction,
  ensureBoardDbs,
  ensureDayColumns,
  ensureKindColumn,
  ensurePlanColumn,
  readBoard,
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
const todoDbOverride = (req: Request) => {
  const raw = new URL(req.url).searchParams.get("todos")?.trim();
  return raw ? raw.replace(/-/g, "") : undefined;
};

/** The schema as it is, plus the columns the dashboard needs and a
 *  deadline-shaped tracker won't have. */
async function taskMap(token: string, taskDbId: string): Promise<TaskMap> {
  const map = await readTaskMap(token, taskDbId);
  return ensureDayColumns(
    token,
    taskDbId,
    await ensureKindColumn(token, taskDbId, await ensurePlanColumn(token, taskDbId, map)),
  );
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

  try {
    const dbs = await ensureBoardDbs(creds.token, creds.contentDbId, taskDbId);
    const map = await taskMap(creds.token, dbs.task);
    const board = await readBoard(creds.token, dbs, map, since.toISOString().slice(0, 10));
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

  const taskDbId = todoDbOverride(req) ?? creds.taskDbId;

  try {
    const dbs = await ensureBoardDbs(creds.token, creds.contentDbId, taskDbId);
    const map = await taskMap(creds.token, dbs.task);
    await applyAction(creds.token, dbs, map, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: humanizeNotionError(e) }, { status: 400 });
  }
}
