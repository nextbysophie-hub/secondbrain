import fs from "fs";
import { state } from "./store.mjs";

/** Cut Room talks to her dashboard for anything that needs a key — Notion,
 *  speech-to-text, the AI picks, Google — so the only thing it stores is the
 *  dashboard link she already has. */
export function parseLink(link) {
  const url = new URL(link.trim());
  const key = url.searchParams.get("key");
  if (!key) throw new Error("That link has no key in it — copy the whole address of your dashboard.");
  return { origin: url.origin, key };
}

async function call(path, init = {}, tries = 3) {
  const { origin, key, dealsCode } = state.config;
  if (!origin || !key) throw new Error("Paste your dashboard link first.");
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${origin}${path}`, {
        ...init,
        headers: { "x-cutroom-key": key, "x-deals-code": dealsCode || "", ...(init.headers || {}) },
      });
      const body = await res.json().catch(() => ({ ok: false, error: `Dashboard replied ${res.status}` }));
      if (res.ok && body.ok !== false) return body;
      last = new Error(body.error || `Dashboard replied ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last;
}

const json = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const getScripts = () => call("/api/cutroom/scripts", {}, 2);
export const transcribeChunk = (file, prompt = "") =>
  call(`/api/cutroom/transcribe?prompt=${encodeURIComponent(prompt.slice(0, 400))}`, {
    method: "POST",
    headers: { "Content-Type": "audio/mpeg" },
    body: fs.readFileSync(file),
  });
export const matchClips = (scripts, clips) => call("/api/cutroom/plan", json({ mode: "match", scripts, clips }));
export const planCut = (script, phrases, revision = null) => call("/api/cutroom/plan", json({ mode: "cut", script, phrases, revision }));
export const driveToken = () => call("/api/cutroom/drive", json({ sealed: state.config.sealed }), 2);
export const handOff = (body) => call("/api/cutroom/approve", json(body));
