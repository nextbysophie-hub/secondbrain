const NOTION_VERSION = "2022-06-28";
const API = "https://api.notion.com/v1";

export type NotionError = { status: number; code?: string; message: string };

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
    const err: NotionError = {
      status: res.status,
      code: typeof body.code === "string" ? body.code : undefined,
      message: typeof body.message === "string" ? body.message : `Notion returned ${res.status}`,
    };
    throw err;
  }
  return body as T;
}

export type BotInfo = { workspaceName: string | null; botName: string | null };

export async function verifyToken(token: string): Promise<BotInfo> {
  const me = await notion<{
    name?: string;
    bot?: { workspace_name?: string; owner?: { type?: string } };
  }>(token, "/users/me");
  return {
    workspaceName: me.bot?.workspace_name ?? null,
    botName: me.name ?? null,
  };
}

export type NotionPage = { id: string; title: string; url: string };

function plainTitle(props: Record<string, unknown>): string {
  for (const value of Object.values(props)) {
    const prop = value as { type?: string; title?: { plain_text?: string }[] };
    if (prop?.type === "title" && Array.isArray(prop.title)) {
      const text = prop.title.map((t) => t.plain_text ?? "").join("").trim();
      if (text) return text;
    }
  }
  return "Untitled";
}

export async function listPages(token: string): Promise<NotionPage[]> {
  const res = await notion<{
    results: { id: string; url: string; properties?: Record<string, unknown>; parent?: { type?: string } }[];
  }>(token, "/search", {
    method: "POST",
    body: JSON.stringify({
      filter: { value: "page", property: "object" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 50,
    }),
  });
  return res.results
    .filter((p) => p.parent?.type !== "database_id")
    .map((p) => ({ id: p.id, title: plainTitle(p.properties ?? {}), url: p.url }));
}

const CONTENT_SCHEMA = {
  Idea: { title: {} },
  Link: { url: {} },
  Status: {
    select: {
      options: [
        { name: "Inbox", color: "gray" },
        { name: "Next Up", color: "yellow" },
        { name: "Making It", color: "blue" },
        { name: "Posted", color: "green" },
      ],
    },
  },
  Source: {
    select: {
      options: [
        { name: "Siri", color: "purple" },
        { name: "Share Sheet", color: "orange" },
        { name: "Manual", color: "default" },
      ],
    },
  },
  Captured: { date: {} },
};

const TASK_SCHEMA = {
  Task: { title: {} },
  Link: { url: {} },
  Done: { checkbox: {} },
  Due: { date: {} },
  Priority: {
    select: {
      options: [
        { name: "Low", color: "gray" },
        { name: "Normal", color: "blue" },
        { name: "High", color: "red" },
      ],
    },
  },
  Status: {
    select: {
      options: [
        { name: "Inbox", color: "gray" },
        { name: "Doing", color: "yellow" },
        { name: "Done", color: "green" },
      ],
    },
  },
  Source: {
    select: {
      options: [
        { name: "Siri", color: "purple" },
        { name: "Share Sheet", color: "orange" },
        { name: "Manual", color: "default" },
      ],
    },
  },
  Captured: { date: {} },
};

export type CreatedDb = { id: string; url: string };

async function createDatabase(
  token: string,
  parentPageId: string,
  title: string,
  emoji: string,
  properties: object,
): Promise<CreatedDb> {
  const db = await notion<{ id: string; url: string }>(token, "/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentPageId },
      icon: { type: "emoji", emoji },
      title: [{ type: "text", text: { content: title } }],
      properties,
    }),
  });
  return { id: db.id, url: db.url };
}

export async function provisionDatabases(
  token: string,
  parentPageId: string,
): Promise<{ content: CreatedDb; task: CreatedDb }> {
  const content = await createDatabase(token, parentPageId, "Content Ideas", "\u{1F4A1}", CONTENT_SCHEMA);
  const task = await createDatabase(token, parentPageId, "To-dos", "\u{2705}", TASK_SCHEMA);
  return { content, task };
}

export type DbConfig = {
  id: string;
  titleField: string;
  linkField: string;
  statusField: string;
  defaultStatus: string;
  sourceField: string;
  dateField: string;
  dueField?: string;
};

export const DB_DEFAULTS: Record<"content" | "task", Omit<DbConfig, "id">> = {
  content: {
    titleField: "Idea",
    linkField: "Link",
    statusField: "Status",
    defaultStatus: "Inbox",
    sourceField: "Source",
    dateField: "Captured",
  },
  task: {
    titleField: "Task",
    linkField: "Link",
    statusField: "Status",
    defaultStatus: "Inbox",
    sourceField: "Source",
    dateField: "Captured",
    dueField: "Due",
  },
};

export type CaptureInput = {
  idea: string;
  link?: string;
  note?: string;
  source?: string;
  /** ISO date (yyyy-mm-dd) for the To-dos database's Due column. */
  due?: string;
};

export async function capture(token: string, db: DbConfig, input: CaptureInput): Promise<{ url: string }> {
  const properties: Record<string, unknown> = {
    [db.titleField]: { title: [{ type: "text", text: { content: input.idea.slice(0, 1900) } }] },
    [db.statusField]: { select: { name: db.defaultStatus } },
    [db.dateField]: { date: { start: new Date().toISOString() } },
  };
  if (input.link) properties[db.linkField] = { url: input.link };
  if (input.due && db.dueField) properties[db.dueField] = { date: { start: input.due } };
  if (input.source) properties[db.sourceField] = { select: { name: input.source } };

  const children = input.note
    ? [
        {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: input.note.slice(0, 1900) } }] },
        },
      ]
    : undefined;

  const page = await notion<{ url: string }>(token, "/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: db.id }, properties, children }),
  });
  return { url: page.url };
}

export function isNotionError(e: unknown): e is NotionError {
  return typeof e === "object" && e !== null && "status" in e && "message" in e;
}

/** Turns Notion's technical errors into something a non-technical person can act on. */
export function humanizeNotionError(e: unknown): string {
  if (!isNotionError(e)) return "Something went wrong talking to Notion. Try again in a moment.";
  if (e.status === 401)
    return "Notion says that key isn't valid. Copy it again from notion.so/my-integrations — it should start with 'ntn_' or 'secret_'.";
  if (e.status === 404)
    return "Notion can't see that page yet. Open the page in Notion, click the ••• menu at the top right, choose Connections, and add your integration.";
  if (e.status === 429) return "Notion is rate-limiting us. Wait about a minute and try again.";
  return e.message;
}
