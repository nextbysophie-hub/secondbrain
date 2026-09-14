import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Smallest possible target: proves a Shortcut can reach this server at all,
 *  separating "iPhone can't talk to the webhook" from "the capture link is wrong". */
export async function GET() {
  return NextResponse.json({ ok: true, message: "Reached it" }, { headers: CORS });
}

export async function POST() {
  return NextResponse.json({ ok: true, message: "Reached it" }, { headers: CORS });
}
