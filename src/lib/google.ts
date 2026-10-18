import { decrypt, encrypt } from "@/lib/crypto";

/** Read-only, and only the calendar: enough to size the day and list the
 *  meetings on it, never to change them. */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

/** The signed-in calendar lives in a cookie rather than a database: the
 *  refresh token is encrypted with the same app secret as the Notion keys, so
 *  the server still stores nothing about anybody. */
export const GOOGLE_COOKIE = "gcal";

/** Cut Room only ever touches the folders and files it made itself. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** Cut Room runs on her computer, so after Google it's sent back to
 *  localhost rather than to a dashboard page. */
export const CUTROOM_STATE = "cutroom:";

export const googleConfigured = () =>
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const redirectUri = (req: Request) => new URL("/api/google/callback", req.url).toString();

export function consentUrl(req: Request, state: string, scope = CALENDAR_SCOPE): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", redirectUri(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenReply = { access_token?: string; refresh_token?: string; error_description?: string; error?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenReply> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
  });
  return (await res.json()) as TokenReply;
}

export const exchangeCode = (req: Request, code: string) =>
  tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(req) });

export const refreshAccess = (refreshToken: string) =>
  tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });

export const sealRefresh = (token: string) => encrypt(token);

export function openRefresh(cookie: string | undefined): string | null {
  if (!cookie) return null;
  try {
    return decrypt(cookie);
  } catch {
    return null;
  }
}

type Busy = { start: string; end: string };
type FreeBusyReply = { calendars?: Record<string, { busy?: Busy[] }>; error?: { message?: string } };

/** Minutes already spoken for inside the working day, from Google's freeBusy
 *  view — times only, no event titles ever leave Google. */
export async function busyMinutes(
  accessToken: string,
  from: Date,
  to: Date,
  timeZone: string,
): Promise<number> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      timeZone,
      items: [{ id: "primary" }],
    }),
  });
  const data = (await res.json()) as FreeBusyReply;
  if (!res.ok) throw new Error(data.error?.message ?? "Google wouldn't share the calendar.");

  // Overlapping meetings shouldn't cost the day twice, so the busy blocks are
  // merged before they're counted.
  const blocks = (data.calendars?.primary?.busy ?? [])
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .map((b) => ({ start: Math.max(b.start, from.getTime()), end: Math.min(b.end, to.getTime()) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  let total = 0;
  let cursor = 0;
  for (const b of blocks) {
    const start = Math.max(b.start, cursor);
    if (b.end > start) total += b.end - start;
    cursor = Math.max(cursor, b.end);
  }
  return Math.round(total / 60000);
}

export type CalendarEvent = {
  id: string;
  title: string;
  /** ISO date-time, or a plain YYYY-MM-DD for all-day events. */
  start: string;
  end: string;
  allDay: boolean;
  link: string | null;
};

type EventsReply = {
  items?: {
    id: string;
    summary?: string;
    status?: string;
    htmlLink?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
  }[];
  error?: { message?: string };
};

/** The meetings and plans on the primary calendar between two moments,
 *  repeating ones expanded, in start order. */
export async function listEvents(
  accessToken: string,
  from: Date,
  to: Date,
  timeZone: string,
): Promise<CalendarEvent[]> {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", from.toISOString());
  url.searchParams.set("timeMax", to.toISOString());
  url.searchParams.set("timeZone", timeZone);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = (await res.json()) as EventsReply;
  if (!res.ok) throw new Error(data.error?.message ?? "Google wouldn't share the calendar.");
  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled" && (e.start?.date || e.start?.dateTime))
    .map((e) => ({
      id: e.id,
      title: e.summary?.trim() || "Busy",
      start: (e.start?.dateTime ?? e.start?.date) as string,
      end: (e.end?.dateTime ?? e.end?.date ?? e.start?.dateTime ?? e.start?.date) as string,
      allDay: !e.start?.dateTime,
      link: e.htmlLink ?? null,
    }));
}
