import fs from "fs/promises";
import path from "path";
import { decrypt, encrypt } from "./crypto";

export type Setup = {
  captureKey: string;
  tokenEnc: string;
  contentDbId: string;
  taskDbId: string;
  createdAt: string;
};

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const FILE_DIR = process.env.SETUP_STORE_DIR || path.join(process.cwd(), ".data");
const FILE_PATH = path.join(FILE_DIR, "setups.json");

async function upstash(command: unknown[]): Promise<unknown> {
  const res = await fetch(UPSTASH_URL as string, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Upstash error ${res.status}`);
  const json = (await res.json()) as { result: unknown };
  return json.result;
}

async function readFileStore(): Promise<Record<string, Setup>> {
  try {
    return JSON.parse(await fs.readFile(FILE_PATH, "utf8")) as Record<string, Setup>;
  } catch {
    return {};
  }
}

export async function saveSetup(setup: Setup): Promise<void> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    await upstash(["SET", `setup:${setup.captureKey}`, JSON.stringify(setup)]);
    return;
  }
  const all = await readFileStore();
  all[setup.captureKey] = setup;
  await fs.mkdir(FILE_DIR, { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(all, null, 2));
}

export async function getSetup(captureKey: string): Promise<Setup | null> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const raw = (await upstash(["GET", `setup:${captureKey}`])) as string | null;
    return raw ? (JSON.parse(raw) as Setup) : null;
  }
  const all = await readFileStore();
  return all[captureKey] ?? null;
}

export function packToken(token: string): string {
  return encrypt(token);
}

export function unpackToken(tokenEnc: string): string {
  return decrypt(tokenEnc);
}

export type Credentials = { token: string; contentDbId: string; taskDbId: string };

/**
 * Capture keys carry their own encrypted credentials so a shared deployment needs
 * no database and a link keeps working across redeploys.
 */
export function packCredentials(creds: Credentials): string {
  return encrypt(JSON.stringify([creds.token, creds.contentDbId, creds.taskDbId]));
}

/**
 * Resolves credentials either from a hosted setup key or from this deployment's
 * own env vars, so the identical code runs in shared mode and in single-user mode.
 */
export async function resolveCredentials(key: string | undefined): Promise<Credentials | null> {
  if (key) {
    const selfContained = unpackCredentials(key);
    if (selfContained) return selfContained;
    const setup = await getSetup(key);
    if (!setup) return null;
    return { token: unpackToken(setup.tokenEnc), contentDbId: setup.contentDbId, taskDbId: setup.taskDbId };
  }
  const token = process.env.NOTION_TOKEN;
  const contentDbId = process.env.CONTENT_DB_ID;
  const taskDbId = process.env.TASK_DB_ID;
  if (!token || !contentDbId) return null;
  return { token, contentDbId, taskDbId: taskDbId || contentDbId };
}

export function unpackCredentials(key: string): Credentials | null {
  try {
    const [token, contentDbId, taskDbId] = JSON.parse(decrypt(key)) as [string, string, string];
    if (!token || !contentDbId) return null;
    return { token, contentDbId, taskDbId: taskDbId || contentDbId };
  } catch {
    return null;
  }
}
