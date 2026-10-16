import { spawn } from "child_process";
import fs from "fs";
import ffmpegStatic from "ffmpeg-static";

/** The bundled ffmpeg means nothing extra to install on her Mac. */
const FFMPEG = process.env.CUTROOM_FFMPEG || ffmpegStatic || "ffmpeg";

export function ffmpeg(args, { onLine } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ["-hide_banner", ...args]);
    let err = "";
    p.stderr.on("data", (d) => {
      const s = d.toString();
      err = (err + s).slice(-20000);
      if (onLine) s.split(/\r|\n/).forEach((l) => l && onLine(l));
    });
    p.stdout.on("data", () => {});
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(err) : reject(Object.assign(new Error(err.split("\n").slice(-4).join(" ").trim() || `ffmpeg exited ${code}`), { log: err }))));
  });
}

/** Length, size, frame rate and whether there's sound, read from ffmpeg's own
 *  description of the file. */
export async function probe(file) {
  const out = await ffmpeg(["-i", file]).catch((e) => e.log ?? "");
  const all = typeof out === "string" ? out : "";
  const d = all.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const video = all.split("\n").find((l) => /Stream #.*Video:/.test(l) && !/attached pic/.test(l)) ?? "";
  const size = video.match(/, (\d{2,5})x(\d{2,5})/);
  const fps = video.match(/([\d.]+) fps/);
  const rotate = all.match(/rotate\s*:\s*(-?\d+)/) || all.match(/rotation of (-?[\d.]+)/);
  return {
    duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
    width: size ? Number(size[1]) : 1920,
    height: size ? Number(size[2]) : 1080,
    fps: fps ? Math.min(60, Number(fps[1])) : 30,
    rotated: rotate ? Math.abs(Number(rotate[1])) % 180 === 90 : false,
    audio: /Stream #.*Audio:/.test(all),
    video: !!video,
  };
}

/** Small mono MP3 slices — all speech-to-text needs, and small enough to send. */
export async function audioChunks(file, duration, dir, chunk = 240) {
  const parts = [];
  for (let start = 0, i = 0; start < Math.max(duration, 0.1); start += chunk, i++) {
    const out = `${dir}/a${String(i).padStart(3, "0")}.mp3`;
    await ffmpeg(["-y", "-ss", String(start), "-t", String(chunk), "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", out]);
    if (fs.existsSync(out) && fs.statSync(out).size > 1000) parts.push({ file: out, offset: start });
  }
  return parts;
}

let encoderCache = null;
async function encoder() {
  if (encoderCache) return encoderCache;
  const list = await ffmpeg(["-encoders"]).catch(() => "");
  encoderCache = /h264_videotoolbox/.test(list) && process.platform === "darwin" ? "videotoolbox" : "x264";
  return encoderCache;
}

/** Every kept range is re-encoded to the same shape, then the pieces are
 *  joined without another encode — accurate cuts, and a crash midway only
 *  costs one piece. */
export async function render(ranges, clips, out, onProgress) {
  const first = clips[ranges[0].clip].probe;
  let w = first.rotated ? first.height : first.width;
  let h = first.rotated ? first.width : first.height;
  w -= w % 2;
  h -= h % 2;
  const fps = first.fps || 30;
  const enc = await encoder();
  const big = w * h > 2_500_000;
  const vcodec =
    enc === "videotoolbox"
      ? ["-c:v", "h264_videotoolbox", "-b:v", big ? "24M" : "12M"]
      : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"];

  const dir = `${out}.parts`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const list = [];
  const total = ranges.reduce((t, r) => t + (r.end - r.start), 0);
  let done = 0;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    const len = r.end - r.start;
    const part = `${dir}/p${String(i).padStart(4, "0")}.mp4`;
    const fade = Math.min(0.03, len / 4);
    await ffmpeg([
      "-y", "-ss", r.start.toFixed(3), "-i", clips[r.clip].path, "-t", len.toFixed(3),
      "-map", "0:v:0", "-map", "0:a:0",
      "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p`,
      "-af", `aresample=48000,afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, len - fade).toFixed(3)}:d=${fade}`,
      "-ac", "2", ...vcodec, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", part,
    ], {
      onLine: (l) => {
        const m = l.match(/time=(\d+):(\d+):([\d.]+)/);
        if (m && onProgress) onProgress(Math.min(0.99, (done + Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) / total));
      },
    });
    done += len;
    list.push(`file '${part.replace(/'/g, "'\\''")}'`);
  }
  fs.writeFileSync(`${dir}/list.txt`, list.join("\n"));
  await ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-c", "copy", "-movflags", "+faststart", out]);
  fs.rmSync(dir, { recursive: true, force: true });
  onProgress?.(1);
}
