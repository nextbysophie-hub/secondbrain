export type Hosting = "hosted" | "self";

export type NotionPageRef = { id: string; title: string; url: string };

export type WizardState = {
  token: string;
  tokenVerified: boolean;
  workspaceName: string | null;
  pages: NotionPageRef[];
  parentPageId: string;
  contentDb: { id: string; url: string } | null;
  taskDb: { id: string; url: string } | null;
  hosting: Hosting | null;
  captureKey: string;
  selfBaseUrl: string;
  tested: boolean;
  testedPageUrl: string;
};

export const EMPTY_STATE: WizardState = {
  token: "",
  tokenVerified: false,
  workspaceName: null,
  pages: [],
  parentPageId: "",
  contentDb: null,
  taskDb: null,
  hosting: null,
  captureKey: "",
  selfBaseUrl: "",
  tested: false,
  testedPageUrl: "",
};

export const STORAGE_KEY = "idea-capture-wizard-v1";

/** The single URL the Shortcut posts to, whichever hosting route they picked. */
export function captureUrl(s: WizardState, origin: string): string {
  if (s.hosting === "self") {
    const base = s.selfBaseUrl.trim().replace(/\/+$/, "").replace(/\/api\/capture$/, "");
    return base ? `${base}/api/capture` : "";
  }
  return s.captureKey ? `${origin}/api/capture?key=${s.captureKey}` : "";
}

/** Apple-signed template Shortcuts, shared from a real iPhone. They carry a
 *  placeholder instead of anyone's credentials. Both hold the capture link in a
 *  single Text action that both branches read from, so there is one box to fill. */
export const SHORTCUT_LINKS: Record<"content" | "task", string> = {
  content: "https://www.icloud.com/shortcuts/381344aa41d8466ba3e9f5b1e2adef38",
  task: "https://www.icloud.com/shortcuts/c13ba5615b2a497eb46e6ba42d99a272",
};

export function templateRepo(): string {
  return process.env.NEXT_PUBLIC_TEMPLATE_REPO || "https://github.com/nextbysophie-hub/idea-capture-setup";
}

export function vercelDeployUrl(): string {
  const params = new URLSearchParams({
    "repository-url": templateRepo(),
    "project-name": "idea-capture",
    "repository-name": "idea-capture",
    env: "NOTION_TOKEN,CONTENT_DB_ID,TASK_DB_ID",
    envDescription: "Paste the three values the setup wizard gives you",
  });
  return `https://vercel.com/new/clone?${params.toString()}`;
}
