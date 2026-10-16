import fs from "fs";
import { driveToken } from "./remote.mjs";
import { save, state } from "./store.mjs";

let cached = { token: null, at: 0 };
async function token(force = false) {
  if (!state.config.sealed) throw new Error("Connect Google Drive first.");
  if (!force && cached.token && Date.now() - cached.at < 45 * 60_000) return cached.token;
  const { accessToken } = await driveToken();
  cached = { token: accessToken, at: Date.now() };
  return accessToken;
}

async function google(url, init = {}) {
  for (let i = 0; i < 2; i++) {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await token(i > 0)}`, ...(init.headers || {}) } });
    if (res.status === 401 && i === 0) continue;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error?.message || `Google Drive replied ${res.status}`);
    return body;
  }
}

export async function folder(name, parent) {
  const body = await google("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parent ? { parents: [parent] } : {}) }),
  });
  return body;
}

/** One "Cut Room" folder at the top of her Drive holds every handoff. */
export async function rootFolder() {
  if (state.config.driveRoot) {
    const ok = await google(`https://www.googleapis.com/drive/v3/files/${state.config.driveRoot}?fields=id,trashed`).catch(() => null);
    if (ok && !ok.trashed) return state.config.driveRoot;
  }
  const made = await folder("Cut Room");
  state.config.driveRoot = made.id;
  save();
  return made.id;
}

const CHUNK = 32 * 1024 * 1024;

/** Resumable upload in 32 MB pieces, so a 10 GB card dump survives a wobbly
 *  connection and the progress bar moves. */
export async function upload(file, name, parent, mime, onProgress) {
  const size = fs.statSync(file).size;
  const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": mime,
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify({ name, parents: [parent] }),
  });
  if (!start.ok) throw new Error(`Drive wouldn't start the upload (${start.status})`);
  const session = start.headers.get("location");
  const fd = fs.openSync(file, "r");
  try {
    let sent = 0;
    let tries = 0;
    while (sent < size || size === 0) {
      const len = Math.min(CHUNK, size - sent);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, sent);
      let res;
      try {
        res = await fetch(session, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${await token()}`,
            "Content-Length": String(len),
            ...(size ? { "Content-Range": `bytes ${sent}-${sent + len - 1}/${size}` } : {}),
          },
          body: buf,
        });
      } catch (e) {
        if (++tries > 5) throw e;
        await new Promise((r) => setTimeout(r, 3000 * tries));
        const probe = await fetch(session, { method: "PUT", headers: { Authorization: `Bearer ${await token()}`, "Content-Range": `bytes */${size}` } });
        const range = probe.headers.get("range");
        sent = range ? Number(range.split("-")[1]) + 1 : 0;
        continue;
      }
      if (res.status === 308) {
        const range = res.headers.get("range");
        sent = range ? Number(range.split("-")[1]) + 1 : sent + len;
        onProgress?.(sent / size);
        continue;
      }
      if (!res.ok) throw new Error(`Drive upload failed (${res.status})`);
      onProgress?.(1);
      return (await res.json()).id;
    }
  } finally {
    fs.closeSync(fd);
  }
}

/** Sharing is the ping: Google emails the editor a link to the folder. */
export async function share(fileId, email, message) {
  const q = new URLSearchParams({ sendNotificationEmail: "true", emailMessage: message.slice(0, 900) });
  return google(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }),
  });
}
