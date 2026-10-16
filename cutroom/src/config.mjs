import fs from "fs";
import os from "os";
import path from "path";

export const PORT = Number(process.env.CUTROOM_PORT || 4848);

/** Everything Cut Room keeps lives in one folder she can find: Movies on a
 *  Mac, the home folder elsewhere. */
export const HOME =
  process.env.CUTROOM_HOME ||
  path.join(os.homedir(), process.platform === "darwin" ? "Movies" : "", "Cut Room");

/** Drop clips here from the desktop, AirDrop, a phone… */
export const INBOX = process.env.CUTROOM_INBOX || path.join(os.homedir(), "Desktop", "Cut Room Inbox");

export const RAW = path.join(HOME, "Raw clips");
export const CUTS = path.join(HOME, "Rough cuts");
export const WORK = path.join(HOME, ".work");

export const VIDEO = /\.(mp4|mov|m4v|mxf|mts|m2ts|avi)$/i;

/** Only recent footage on a card imports by itself, so plugging in a card
 *  full of old shoots doesn't quietly transcribe months of video. */
export const CARD_DAYS = Number(process.env.CUTROOM_CARD_DAYS || 14);

/** Where removable drives show up. */
export function volumeRoots() {
  if (process.env.CUTROOM_VOLUMES) return process.env.CUTROOM_VOLUMES.split(path.delimiter);
  if (process.platform === "darwin") return ["/Volumes"];
  const user = os.userInfo().username;
  return [`/media/${user}`, `/run/media/${user}`];
}

for (const dir of [HOME, INBOX, RAW, CUTS, WORK]) fs.mkdirSync(dir, { recursive: true });
