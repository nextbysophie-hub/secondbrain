import { NextResponse } from "next/server";
import type { Board } from "@/lib/board";

const iso = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const day = (n: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), n)).toISOString().slice(0, 10);
};
const today = Number(iso(0).slice(8));

const habits = [
  { id: "h1", name: "Gym", cadence: "Daily", bad: false },
  { id: "h2", name: "Read 20 min", cadence: "Daily", bad: false },
  { id: "h3", name: "No phone before 9", cadence: "Daily", bad: false },
  { id: "h4", name: "Film something", cadence: "Daily", bad: false },
  { id: "h5", name: "Plan the week", cadence: "Weekly", bad: false },
  { id: "h6", name: "Doomscrolling", cadence: "Daily", bad: true },
];

const ticks = habits.flatMap((h, hi) =>
  Array.from({ length: today }, (_, i) => i + 1)
    .filter((d) => (h.bad ? d % 5 === 0 : (d * (hi + 2)) % 3 !== 0))
    .map((d) => ({ id: `t${h.id}-${d}`, habitId: h.id, date: day(d) })),
);

export function demoBoard() {
  const board: Board = {
    dbs: { content: "demo", task: "demo", habits: "demo", ticks: "demo", goals: "demo", agent: "demo" },
    categories: ["Work", "Personal", "Health", "Money", "Other"],
    todos: [
      { id: "d1", title: "Send Millie the script", done: false, due: iso(0), plan: iso(0), kind: "deadline", slot: "deep", minutes: null, category: "Work", priority: "High", link: null, source: "Siri", url: "#" },
      { id: "d2", title: "Film the b-roll in the car", done: false, due: iso(0), plan: iso(0), kind: "want", slot: "deep", minutes: null, category: "Work", priority: null, link: null, source: "Siri", url: "#" },
      { id: "d3", title: "Renew the domain", done: false, due: iso(-2), plan: null, kind: null, slot: "quick", minutes: 15, category: "Money", priority: null, link: null, source: "Manual", url: "#" },
      { id: "d4", title: "Book the dentist", done: false, due: iso(3), plan: null, kind: null, slot: null, minutes: null, category: "Health", priority: null, link: null, source: "Siri", url: "#" },
      { id: "d5", title: "Reply to the brand email", done: true, due: iso(-1), plan: null, kind: null, slot: null, minutes: 25, category: "Work", priority: null, link: null, source: "Manual", url: "#" },
      { id: "d6", title: "Buy Patrick a birthday thing", done: false, due: iso(6), plan: null, kind: null, slot: null, minutes: null, category: "Personal", priority: null, link: null, source: "Siri", url: "#" },
      { id: "d7", title: "Move money to savings", done: false, due: null, plan: iso(0), kind: null, slot: "quick", minutes: null, category: "Money", priority: null, link: null, source: "Siri", url: "#" },
      { id: "d8", title: "Call mum back", done: false, due: null, plan: iso(0), kind: null, slot: "quick", minutes: null, category: "Personal", priority: null, link: null, source: "Siri", url: "#" },
      { id: "d11", title: "Go through emails", done: false, due: null, plan: iso(0), kind: "want", slot: "quick", minutes: null, category: "Work", priority: null, link: null, source: "Manual", url: "#" },
      { id: "d9", title: "Batch 3 reels", done: false, due: iso(1), plan: iso(1), kind: "want", slot: "deep", minutes: 240, category: "Work", priority: null, link: null, source: "Manual", url: "#" },
      { id: "d10", title: "Stretch before bed", done: true, due: iso(0), plan: null, kind: null, slot: null, minutes: 10, category: "Health", priority: null, link: null, source: "Manual", url: "#" },
    ],
    agent: [
      { id: "a1", title: "Book car detailing for Saturday", details: "Interior + exterior, somewhere in Austin, under $200.", due: iso(2), status: "Working", result: "", url: "#" },
      { id: "a2", title: "Find a dentist that takes my insurance", details: "", due: null, status: "Queued", result: "", url: "#" },
      { id: "a3", title: "Renew the domain", details: "", due: iso(-2), status: "Done", result: "Renewed for 2 years, receipt in your email.", url: "#" },
    ],
    ideas: [
      { id: "i1", title: "Video: the 3 apps I deleted this year", status: "Inbox", link: null, captured: iso(0), url: "#" },
      { id: "i2", title: "Hook — my best ideas die in the shower", status: "Inbox", link: null, captured: iso(0), url: "#" },
      { id: "i3", title: "Steal this transition", status: "Inbox", link: "https://instagram.com/reel/xyz", captured: iso(-1), url: "#" },
      { id: "i4", title: "Series: building my own tools", status: "Next Up", link: null, captured: iso(-2), url: "#" },
      { id: "i5", title: "Why I stopped using 10 note apps", status: "Making It", link: null, captured: iso(-5), url: "#" },
      { id: "i6", title: "Morning routine, honestly", status: "Posted", link: null, captured: iso(-12), url: "#" },
    ],
    habits,
    ticks,
    timings: [
      { title: "Film the b-roll in the car", minutes: 240 },
      { title: "Film the studio set", minutes: 215 },
      { title: "Batch 3 reels", minutes: 180 },
      { title: "Reply to the brand email", minutes: 25 },
      { title: "Emails", minutes: 35 },
      { title: "Emails", minutes: 20 },
      { title: "Renew the domain", minutes: 15 },
    ],
    goals: [
      { id: "g1", name: "Ship the freebie", area: "Business", period: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`, done: true },
      { id: "g2", name: "Two brand deals", area: "Business", period: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`, done: false },
      { id: "g3", name: "Post 3× a week", area: "Content", period: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`, done: false },
      { id: "g4", name: "Build a real content bank", area: "Content", period: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`, done: true },
      { id: "g5", name: "Gym 4× a week", area: "Health", period: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`, done: false },
      { id: "g6", name: "Weekend off the laptop", area: "Life", period: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`, done: false },
    ],
  };
  return NextResponse.json({ ok: true, ...board });
}
