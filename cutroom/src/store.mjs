import fs from "fs";
import path from "path";
import { HOME } from "./config.mjs";

const FILE = path.join(HOME, "cut-room.json");

const empty = () => ({
  config: { origin: null, key: null, dealsCode: "", sealed: null, driveRoot: null },
  clips: {},
  cuts: {},
  seen: {},
  older: {},
  scripts: [],
  people: [],
  scriptsAt: 0,
  scriptsError: null,
  log: [],
});

function load() {
  try {
    const s = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
    // Anything mid-step when the app last closed starts that step again.
    for (const c of Object.values(s.clips)) {
      if (c.status === "copying") c.status = "found";
      if (c.status === "transcribing") c.status = "copied";
    }
    for (const cut of Object.values(s.cuts)) {
      if (cut.status === "cutting") cut.status = "waiting";
      if (cut.status === "approving") {
        cut.status = "review";
        cut.error = "Cut Room closed while sending — press Approve again.";
      }
    }
    return s;
  } catch {
    return empty();
  }
}

export const state = load();

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
    fs.renameSync(tmp, FILE);
  }, 150);
}

export function log(msg) {
  const line = `${new Date().toLocaleTimeString()} ${msg}`;
  console.log(line);
  state.log = [line, ...state.log].slice(0, 60);
  save();
}

export const newId = () => Math.random().toString(36).slice(2, 10);
