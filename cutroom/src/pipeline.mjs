import fs from "fs";
import path from "path";
import { CARD_DAYS, CUTS, INBOX, RAW, VIDEO, WORK, volumeRoots } from "./config.mjs";
import * as drive from "./drive.mjs";
import { audioChunks, probe, render } from "./media.mjs";
import { getScripts, handOff, matchClips, planCut, transcribeChunk } from "./remote.mjs";
import { log, newId, save, state } from "./store.mjs";

/* ───────────── finding footage ───────────── */

const SKIP_DIR = /^(THMBNL|SUB|AVF_INFO|GENERAL|System Volume Information|\$RECYCLE\.BIN|Library|Applications|Backups\.backupdb)$/i;

function walk(dir, depth, out) {
  if (depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !SKIP_DIR.test(e.name)) walk(p, depth - 1, out);
    else if (e.isFile() && VIDEO.test(e.name)) out.push(p);
  }
}

/** A camera card has the folders cameras write (DCIM, Sony's PRIVATE…) or is
 *  small; big backup drives are left alone. */
function cards() {
  const found = [];
  for (const root of volumeRoots()) {
    let names;
    try {
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      const p = path.join(root, name);
      try {
        const st = fs.lstatSync(p);
        if (st.isSymbolicLink() || !st.isDirectory()) continue;
        const kids = fs.readdirSync(p).map((k) => k.toUpperCase());
        const cameraish = kids.some((k) => ["DCIM", "PRIVATE", "M4ROOT", "CLIP", "AVCHD", "XDROOT", "CONTENTS"].includes(k));
        const fsInfo = fs.statfsSync?.(p);
        const small = fsInfo ? fsInfo.blocks * fsInfo.bsize < 1.1e12 : true;
        if (cameraish || small) found.push({ name, path: p });
      } catch {
        continue;
      }
    }
  }
  return found;
}

const sizes = new Map();
const allowOld = new Set();
const fingerprint = (file, st) => `${path.basename(file)}|${st.size}|${Math.round(st.mtimeMs / 1000)}`;
export let volumes = [];

export function scan() {
  const now = Date.now();
  const found = [];
  const inbox = [];
  walk(INBOX, 3, inbox);
  for (const file of inbox) found.push({ file, from: "inbox", volume: null });

  const cardList = cards();
  volumes = cardList.map((v) => v.name);
  for (const v of [...allowOld]) if (!volumes.includes(v)) allowOld.delete(v);
  for (const v of cardList) {
    const files = [];
    walk(v.path, 6, files);
    for (const file of files) found.push({ file, from: "card", volume: v.name });
  }

  const older = {};
  for (const c of found) {
    let st;
    try {
      st = fs.statSync(c.file);
    } catch {
      continue;
    }
    const fp = fingerprint(c.file, st);
    if (state.seen[fp]) continue;
    const before = sizes.get(c.file);
    sizes.set(c.file, st.size);
    // Still copying in (or still recording): wait until the size settles.
    if (before !== st.size || now - st.mtimeMs < 3000 || st.size === 0) continue;
    if (c.from === "card" && now - st.mtimeMs > CARD_DAYS * 864e5 && !allowOld.has(c.volume)) {
      older[c.volume] = (older[c.volume] || 0) + 1;
      continue;
    }
    const id = newId();
    state.seen[fp] = id;
    state.clips[id] = {
      id,
      name: path.basename(c.file),
      src: c.file,
      from: c.from,
      volume: c.volume,
      size: st.size,
      recorded: st.mtimeMs,
      status: "found",
      addedAt: now,
    };
    log(`Found ${path.basename(c.file)}${c.volume ? ` on ${c.volume}` : ""}`);
  }
  state.older = older;
  save();
}

export function importOlder(volume) {
  allowOld.add(volume);
}

/* ───────────── per-clip steps ───────────── */

const day = (ms) => new Date(ms).toISOString().slice(0, 10);

function libraryPath(clip) {
  const dir = path.join(RAW, day(clip.recorded));
  fs.mkdirSync(dir, { recursive: true });
  // Cameras restart at C0001 on every card, so the card name rides along.
  const base = clip.volume ? `${clip.volume.replace(/[^\w-]+/g, "")}_${clip.name}` : clip.name;
  let target = path.join(dir, base);
  const ext = path.extname(base);
  for (let i = 2; fs.existsSync(target); i++) target = path.join(dir, `${path.basename(base, ext)} (${i})${ext}`);
  return target;
}

async function bringIn(clip) {
  clip.status = "copying";
  save();
  const target = libraryPath(clip);
  if (clip.from === "inbox") {
    try {
      fs.renameSync(clip.src, target);
    } catch {
      await fs.promises.copyFile(clip.src, target);
      fs.unlinkSync(clip.src);
    }
  } else {
    await fs.promises.copyFile(clip.src, `${target}.part`);
    fs.renameSync(`${target}.part`, target);
  }
  clip.path = target;
  clip.probe = await probe(target);
  clip.duration = clip.probe.duration;
  clip.status = "copied";
  save();
}

const transcriptFile = (id) => path.join(WORK, `${id}.json`);
export const transcriptOf = (id) => {
  try {
    return JSON.parse(fs.readFileSync(transcriptFile(id), "utf8"));
  } catch {
    return { text: "", words: [], segments: [] };
  }
};

async function listen(clip) {
  if (!clip.probe?.duration) {
    clip.probe = await probe(clip.path);
    clip.duration = clip.probe.duration;
  }
  if (!clip.probe?.audio) {
    clip.status = "nospeech";
    save();
    return;
  }
  clip.status = "transcribing";
  save();
  const dir = path.join(WORK, clip.id);
  fs.mkdirSync(dir, { recursive: true });
  const parts = await audioChunks(clip.path, clip.duration, dir);
  const words = [];
  const segments = [];
  const texts = [];
  const prompt = state.scripts.map((s) => s.title).join(", ");
  for (const part of parts) {
    const t = await transcribeChunk(part.file, prompt);
    words.push(...t.words.map((w) => ({ ...w, s: w.s + part.offset, e: w.e + part.offset })));
    segments.push(...t.segments.map((s) => ({ ...s, s: s.s + part.offset, e: s.e + part.offset })));
    texts.push(t.text);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  const text = texts.join(" ").trim();
  fs.writeFileSync(transcriptFile(clip.id), JSON.stringify({ text, words, segments }));
  clip.preview = text.slice(0, 280);
  clip.status = words.length ? "heard" : "nospeech";
  save();
}

/* ───────────── scripts + matching ───────────── */

export async function refreshScripts(force = false) {
  if (!force && Date.now() - state.scriptsAt < 120_000) return;
  try {
    const r = await getScripts();
    state.scripts = r.scripts;
    state.people = r.people;
    state.dealsIncluded = r.deals;
    state.scriptsError = null;
    for (const cut of Object.values(state.cuts)) {
      const s = r.scripts.find((x) => x.id === cut.scriptId);
      if (s) Object.assign(cut, { title: s.title, url: s.url, source: s.source, stage: s.stage, script: s.text, ...(cut.editor ? {} : { editor: s.editor }) });
    }
  } catch (e) {
    state.scriptsError = e.message;
  }
  state.scriptsAt = Date.now();
  save();
}

function cutFor(scriptId) {
  const s = state.scripts.find((x) => x.id === scriptId);
  if (!state.cuts[scriptId]) {
    state.cuts[scriptId] = { id: scriptId, scriptId, version: 0, status: "waiting", history: [], editor: s?.editor ?? null };
  }
  const cut = state.cuts[scriptId];
  if (s) Object.assign(cut, { title: s.title, url: s.url, source: s.source, stage: s.stage, script: s.text });
  return cut;
}

/** Her notes on the cut she watched; the next version applies them. */
export function revise(cutId, notes) {
  const cut = state.cuts[cutId];
  cut.pendingRevision = notes.trim();
  markDirty(cutId);
}

export function markDirty(scriptId) {
  if (!scriptId) return;
  const cut = cutFor(scriptId);
  cut.dirty = true;
  if (cut.status !== "approving") cut.status = "waiting";
  save();
}

async function match(clips) {
  await refreshScripts(true);
  if (!state.scripts.length) {
    for (const c of clips) c.status = "unmatched";
    save();
    return;
  }
  const scripts = state.scripts.map((s) => ({ id: s.id, title: s.title, text: s.text }));
  for (let i = 0; i < clips.length; i += 12) {
    const batch = clips.slice(i, i + 12);
    const reply = await matchClips(
      scripts,
      batch.map((c) => ({ id: c.id, name: c.name, transcript: transcriptOf(c.id).text })),
    );
    for (const c of batch) {
      const m = (reply.clips || []).find((x) => x.clip === c.id);
      const ok = m && m.script && (m.confidence ?? 0) >= 0.5 && state.scripts.some((s) => s.id === m.script);
      c.scriptId = ok ? m.script : null;
      c.why = m?.why ?? null;
      c.status = ok ? "matched" : "unmatched";
      if (ok) {
        markDirty(c.scriptId);
        log(`${c.name} → “${state.scripts.find((s) => s.id === c.scriptId)?.title}”`);
      } else log(`${c.name}: no script matched`);
    }
    save();
  }
}

/* ───────────── the rough cut ───────────── */

/** Words grouped into short phrases at pauses and sentence breaks — small
 *  enough that a retake can be cut out, big enough for the AI to read. */
export function phrasesOf({ words, segments }) {
  if (!words?.length) return (segments || []).map((s) => ({ s: s.s, e: s.e, t: s.t, words: [{ w: s.t, s: s.s, e: s.e }] }));
  const out = [];
  let cur = null;
  let si = 0;
  for (const w of words) {
    while (si < segments.length - 1 && w.s >= segments[si].e - 0.02) si++;
    if (!cur || w.s - cur.e > 0.45 || si !== cur.seg || cur.words.length >= 14) {
      cur = { s: w.s, e: w.e, seg: si, words: [] };
      out.push(cur);
    }
    cur.words.push(w);
    cur.e = w.e;
  }
  return out.map((p) => ({ s: p.s, e: p.e, t: p.words.map((w) => w.w.trim()).join(" "), words: p.words }));
}

/** The AI's picks become time ranges: padded a touch so no word is clipped,
 *  and split wherever she paused for more than a beat. */
export function rangesFrom(picks, byId, clipsById) {
  const ranges = [];
  for (const pk of picks || []) {
    const a = byId.get(pk.from);
    let b = byId.get(pk.to) ?? a;
    if (!a) continue;
    if (b.clip !== a.clip || b.idx < a.idx) b = a;
    const words = a.list.slice(a.idx, b.idx + 1).flatMap((p) => p.words);
    const dur = clipsById[a.clip].duration || Infinity;
    let group = [];
    const flush = () => {
      if (!group.length) return;
      ranges.push({
        clip: a.clip,
        start: Math.max(0, group[0].s - 0.12),
        end: Math.min(dur, group[group.length - 1].e + 0.22),
        text: group.map((w) => w.w.trim()).join(" "),
        line: pk.line ?? null,
      });
      group = [];
    };
    for (const w of words) {
      if (group.length && w.s - group[group.length - 1].e > 0.6) flush();
      group.push(w);
    }
    flush();
  }
  const merged = [];
  for (const r of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && prev.clip === r.clip && r.start >= prev.start && r.start - prev.end < 0.15) {
      prev.end = Math.max(prev.end, r.end);
      prev.text += ` ${r.text}`;
    } else if (r.end - r.start >= 0.25) merged.push({ ...r });
  }
  return merged;
}

const safe = (s) => (s || "Untitled").replace(/[/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
const stamp = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

async function makeCut(cut) {
  const clips = Object.values(state.clips)
    .filter((c) => c.scriptId === cut.scriptId && c.status === "matched")
    .sort((a, b) => a.recorded - b.recorded || a.name.localeCompare(b.name));
  cut.dirty = false;
  cut.clipIds = clips.map((c) => c.id);
  if (!clips.length) {
    cut.status = "empty";
    save();
    return;
  }
  cut.status = "cutting";
  cut.progress = 0;
  cut.error = null;
  save();

  const byId = new Map();
  const phrases = [];
  clips.forEach((c, k) => {
    const list = phrasesOf(transcriptOf(c.id));
    list.forEach((p, j) => {
      const id = `c${k + 1}.p${j + 1}`;
      byId.set(id, { clip: c.id, idx: j, list });
      phrases.push({ id, t: p.t });
    });
  });
  const clipsById = Object.fromEntries(clips.map((c) => [c.id, c]));
  const rev = cut.pendingRevision || null;
  const sameClips = JSON.stringify(cut.plan?.clipIds) === JSON.stringify(cut.clipIds);
  const revision = rev
    ? { notes: rev, current: sameClips ? cut.plan?.picks ?? null : null, currentText: (cut.picks || []).map((p) => p.text) }
    : null;
  const plan = await planCut({ title: cut.title, text: cut.script || "" }, phrases, revision);
  const ranges = rangesFrom(plan.picks, byId, clipsById);
  if (!ranges.length) throw new Error("Couldn't find any lines of the script in these clips.");

  const version = (cut.version || 0) + 1;
  const dir = path.join(CUTS, safe(cut.title));
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${safe(cut.title)} — rough cut v${version}.mp4`);
  await render(ranges, clipsById, out, (p) => {
    cut.progress = p;
    save();
  });

  const csv = [
    "order,script line,clip,in,out,length,words",
    ...ranges.map((r, i) =>
      [i + 1, r.line ?? "", clipsById[r.clip].name, stamp(r.start), stamp(r.end), (r.end - r.start).toFixed(2), `"${r.text.replace(/"/g, '""')}"`].join(","),
    ),
  ].join("\n");
  fs.writeFileSync(path.join(dir, `cut list v${version}.csv`), csv);

  const earlier = cut.versions || (cut.file ? [{ version: cut.version, file: cut.file, revision: null, notes: cut.notes, length: cut.length, madeAt: cut.madeAt }] : []);
  Object.assign(cut, {
    version,
    file: out,
    csv: path.join(dir, `cut list v${version}.csv`),
    picks: ranges.map((r) => ({ ...r, clipName: clipsById[r.clip].name })),
    notes: plan.notes || "",
    length: ranges.reduce((t, r) => t + r.end - r.start, 0),
    rawLength: clips.reduce((t, c) => t + (c.duration || 0), 0),
    status: "review",
    progress: 1,
    madeAt: Date.now(),
    plan: { clipIds: cut.clipIds, picks: (plan.picks || []).map(({ line, from, to }) => ({ line, from, to })) },
    pendingRevision: null,
  });
  cut.versions = [...earlier, { version, file: out, revision: rev, notes: cut.notes, length: cut.length, madeAt: cut.madeAt }];
  log(`Rough cut v${version} ready: “${cut.title}”${rev ? ` (revised: ${rev.slice(0, 60)})` : ""}`);
  save();
}

/* ───────────── approve → Drive → editor ───────────── */

const MIME = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".mxf": "application/mxf", ".mts": "video/mp2t" };

export async function approve(cutId, { editorId, editorEmail, note, raw = true }) {
  const cut = state.cuts[cutId];
  if (!cut?.file) throw new Error("There's no cut to send yet.");
  if (!state.config.sealed) throw new Error("Connect Google Drive first (button at the top).");
  const person = state.people.find((p) => p.id === editorId) || null;
  const email = (editorEmail || person?.email || "").trim() || null;
  cut.editor = person || (email ? { id: null, name: email, email } : null);
  cut.status = "approving";
  cut.error = null;
  cut.sendStep = "Making the Drive folder";
  cut.sendProgress = 0;
  save();

  (async () => {
    try {
      const root = await drive.rootFolder();
      const folder = await drive.folder(`${safe(cut.title)} — ${day(Date.now())}`, root);
      const clips = raw ? cut.clipIds.map((id) => state.clips[id]).filter((c) => c?.path && fs.existsSync(c.path)) : [];
      const files = [
        { file: cut.file, name: path.basename(cut.file), parent: folder.id },
        { file: cut.csv, name: path.basename(cut.csv), parent: folder.id },
      ];
      const scriptFile = path.join(path.dirname(cut.file), "script.txt");
      fs.writeFileSync(scriptFile, `${cut.title}\n${cut.url || ""}\n\n${cut.script || ""}\n`);
      files.push({ file: scriptFile, name: "script.txt", parent: folder.id });
      if (clips.length) {
        const rawFolder = await drive.folder("Raw clips", folder.id);
        for (const c of clips) files.push({ file: c.path, name: path.basename(c.path), parent: rawFolder.id });
      }
      const total = files.reduce((t, f) => t + fs.statSync(f.file).size, 0) || 1;
      let done = 0;
      for (const f of files) {
        const size = fs.statSync(f.file).size;
        cut.sendStep = `Uploading ${f.name}`;
        save();
        await drive.upload(f.file, f.name, f.parent, MIME[path.extname(f.file).toLowerCase()] || "text/plain", (p) => {
          cut.sendProgress = (done + p * size) / total;
          save();
        });
        done += size;
      }
      const message = `${note ? `${note}\n\n` : ""}Rough cut v${cut.version} of “${cut.title}” is approved — rough cut, cut list, script and raw clips are in this folder.${cut.url ? `\nNotion: ${cut.url}` : ""}`;
      if (email) {
        cut.sendStep = `Sharing with ${email}`;
        save();
        await drive.share(folder.id, email, message);
      }
      cut.sendStep = "Pinging on Notion";
      save();
      await handOff({
        pageId: cut.scriptId,
        editorId: person?.id ?? null,
        driveUrl: folder.webViewLink,
        note: `Rough cut v${cut.version} approved${note ? ` — ${note}` : ""}${!person && email ? ` (shared with ${email})` : ""}.`,
      });
      cut.history = [...(cut.history || []), { version: cut.version, driveUrl: folder.webViewLink, to: email, at: Date.now() }];
      Object.assign(cut, { status: "sent", driveUrl: folder.webViewLink, sentAt: Date.now(), sendStep: null, sendProgress: 1 });
      log(`Sent “${cut.title}” to ${email || "Drive"}`);
    } catch (e) {
      Object.assign(cut, { status: "review", error: e.message, sendStep: null });
      log(`Couldn't send “${cut.title}”: ${e.message}`);
    }
    save();
  })();
}

/* ───────────── the loop ───────────── */

async function step() {
  const clips = Object.values(state.clips);
  const ready = () => !!state.config.key;
  const fail = (c, e) => {
    c.status = "error";
    c.error = e.message;
    log(`${c.name}: ${e.message}`);
    save();
  };

  const found = clips.find((c) => c.status === "found");
  if (found) return await bringIn(found).catch((e) => fail(found, e)), true;
  if (!ready()) return false;

  const copied = clips.find((c) => c.status === "copied");
  if (copied) return await listen(copied).catch((e) => fail(copied, e)), true;

  const heard = clips.filter((c) => c.status === "heard");
  if (heard.length) {
    await match(heard).catch((e) => {
      state.scriptsError = e.message;
      log(`Matching failed: ${e.message}`);
      for (const c of heard) c.status = "unmatched";
    });
    return true;
  }

  const busy = clips.some((c) => ["found", "copying", "copied", "transcribing"].includes(c.status));
  const dirty = !busy && Object.values(state.cuts).find((c) => c.dirty && c.status !== "approving");
  if (dirty) {
    await makeCut(dirty).catch((e) => {
      Object.assign(dirty, { status: "error", error: e.message });
      log(`Cut failed for “${dirty.title}”: ${e.message}`);
      save();
    });
    return true;
  }
  return false;
}

let running = false;
export function start() {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      scan();
      for (let i = 0; i < 50 && (await step()); i++) if (i % 3 === 2) scan();
    } catch (e) {
      log(`Hiccup: ${e.message}`);
    } finally {
      running = false;
    }
  };
  tick();
  setInterval(tick, 4000);
  setInterval(() => state.config.key && refreshScripts(), 5 * 60_000);
}
