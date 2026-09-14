import { buildShortcut } from "@/lib/shortcut";

export const runtime = "nodejs";

/** Hands back a ready-to-install Shortcut file with the person's own key
 *  already inside, so nothing has to be built or pasted by hand. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const kind = params.get("type") === "task" ? "task" : "content";
  const key = (params.get("key") || "").trim();
  const origin = new URL(req.url).origin;
  const captureUrl = (params.get("url") || `${origin}/api/capture`)
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/capture$/, "")
    .concat("/api/capture");

  const name = kind === "task" ? "Capture To-do" : "Capture Idea";

  return new Response(buildShortcut({ captureUrl, captureKey: key, kind }), {
    headers: {
      "Content-Type": "application/x-plist",
      "Content-Disposition": `attachment; filename="${name}.shortcut"`,
      "Cache-Control": "no-store",
    },
  });
}
