import { exec } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { HOME, INBOX, PORT } from "./config.mjs";
import { approve, importOlder, markDirty, refreshScripts, start, transcriptOf, volumes, revise } from "./pipeline.mjs";
import { getScripts, parseLink } from "./remote.mjs";
import { log, save, state } from "./store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, "..", "public", "index.html");

const openThing = (target) => {
  if (process.env.CUTROOM_NO_OPEN) return;
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${target}"`);
};

function view() {
  const { sealed, key, ...config } = state.config;
  return {
    config: { ...config, linked: !!key, drive: !!sealed },
    home: HOME,
    inbox: INBOX,
    volumes,
    older: state.older,
    clips: Object.values(state.clips).sort((a, b) => b.addedAt - a.addedAt),
    cuts: Object.values(state.cuts).sort((a, b) => (b.madeAt || 0) - (a.madeAt || 0)),
    scripts: state.scripts.map(({ id, title, source, stage, url }) => ({ id, title, source, stage, url })),
    people: state.people,
    scriptsError: state.scriptsError,
    dealsIncluded: state.dealsIncluded,
    log: state.log.slice(0, 25),
  };
}

const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const readJson = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });

/** Video with range requests, so the player can scrub without loading it all. */
function stream(req, res, file) {
  if (!file || !fs.existsSync(file)) return send(res, 404, { error: "gone" });
  const size = fs.statSync(file).size;
  const type = /\.mov$/i.test(file) ? "video/quicktime" : "video/mp4";
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (!m) {
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    return fs.createReadStream(file).pipe(res);
  }
  const start = m[1] ? Number(m[1]) : size - Number(m[2]);
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  res.writeHead(206, {
    "Content-Type": type,
    "Content-Length": end - start + 1,
    "Content-Range": `bytes ${start}-${end}/${size}`,
    "Accept-Ranges": "bytes",
  });
  fs.createReadStream(file, { start, end }).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const parts = p.split("/").filter(Boolean);
  try {
    if (req.method === "GET" && p === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(PAGE));
    }
    if (p === "/api/state") return send(res, 200, view());
    if (parts[0] === "media" && parts[1] === "cut") {
      const cut = state.cuts[decodeURIComponent(parts[2])];
      const old = (cut?.versions || []).find((v) => String(v.version) === url.searchParams.get("v"));
      return stream(req, res, old?.file || cut?.file);
    }
    if (parts[0] === "media" && parts[1] === "clip") return stream(req, res, state.clips[parts[2]]?.path);

    if (p === "/connect-drive") {
      if (!state.config.origin) return send(res, 400, { error: "Paste your dashboard link first." });
      res.writeHead(302, { Location: `${state.config.origin}/api/google/start?cutroom=${PORT}` });
      return res.end();
    }
    if (p === "/drive-connected") {
      const sealed = url.searchParams.get("sealed");
      if (sealed) {
        state.config.sealed = sealed;
        log("Google Drive connected");
        save();
      }
      res.writeHead(302, { Location: sealed ? "/" : `/?drive_error=${encodeURIComponent(url.searchParams.get("error") || "Google didn't connect")}` });
      return res.end();
    }

    if (req.method !== "POST") return send(res, 404, { error: "Not here." });
    // Only Cut Room's own page may press its buttons, not some other website.
    const from = req.headers.origin;
    if (from && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(from)) return send(res, 403, { error: "Not allowed." });
    const body = await readJson(req);

    if (p === "/api/setup") {
      const before = { ...state.config };
      try {
        if (body.link) Object.assign(state.config, parseLink(body.link));
        if (body.dealsCode !== undefined) state.config.dealsCode = body.dealsCode;
        const r = await getScripts();
        state.scripts = r.scripts;
        state.people = r.people;
        state.dealsIncluded = r.deals;
        state.scriptsAt = Date.now();
        state.scriptsError = null;
        log(`Connected to the dashboard — ${r.scripts.length} scripts in progress`);
        save();
        return send(res, 200, { ok: true });
      } catch (e) {
        state.config = before;
        save();
        return send(res, 400, { ok: false, error: e.message });
      }
    }
    if (p === "/api/refresh") {
      await refreshScripts(true);
      return send(res, 200, { ok: !state.scriptsError, error: state.scriptsError });
    }
    if (p === "/api/open") {
      openThing(body.what === "cuts" ? path.join(HOME, "Rough cuts") : INBOX);
      return send(res, 200, { ok: true });
    }
    if (p === "/api/import-older") {
      importOlder(body.volume);
      return send(res, 200, { ok: true });
    }
    if (parts[1] === "clips" && state.clips[parts[2]]) {
      const clip = state.clips[parts[2]];
      const old = clip.scriptId;
      if (parts[3] === "assign") {
        clip.scriptId = body.scriptId || null;
        clip.status = clip.scriptId ? "matched" : "unmatched";
        clip.manual = true;
      }
      if (parts[3] === "skip") {
        clip.scriptId = null;
        clip.status = "skipped";
      }
      if (parts[3] === "retry") clip.status = clip.path ? "copied" : "found";
      if (old !== clip.scriptId) markDirty(old);
      markDirty(clip.scriptId);
      save();
      return send(res, 200, { ok: true });
    }
    if (parts[1] === "clips" && parts[3] === "transcript") return send(res, 200, transcriptOf(parts[2]));
    if (parts[1] === "cuts" && state.cuts[decodeURIComponent(parts[2])]) {
      const id = decodeURIComponent(parts[2]);
      if (parts[3] === "recut") markDirty(id);
      if (parts[3] === "revise") {
        if (!String(body.notes || "").trim()) return send(res, 400, { ok: false, error: "Type what should change first." });
        if (!state.cuts[id].file) return send(res, 400, { ok: false, error: "Wait for the first cut before revising." });
        revise(id, String(body.notes));
      }
      if (parts[3] === "editor") {
        state.cuts[id].editor = state.people.find((x) => x.id === body.editorId) || (body.email ? { id: null, name: body.email, email: body.email } : null);
        save();
      }
      if (parts[3] === "approve") {
        try {
          await approve(id, body);
        } catch (e) {
          return send(res, 400, { ok: false, error: e.message });
        }
      }
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: "Not here." });
  } catch (e) {
    send(res, 500, { ok: false, error: e.message });
  }
});

server.on("error", (e) => {
  // Already running (double-clicked twice): just bring the page up.
  if (e.code === "EADDRINUSE") {
    openThing(`http://localhost:${PORT}`);
    process.exit(0);
  }
  throw e;
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Cut Room is running — http://localhost:${PORT}\nWatching ${INBOX} and any SD card you plug in.\nLeave this window open; close it to stop.`);
  openThing(`http://localhost:${PORT}`);
  start();
});
