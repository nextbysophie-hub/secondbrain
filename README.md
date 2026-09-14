# Idea Capture

A voice-activated second brain: say "Hey Siri, capture idea", speak the thought, and it lands in your Notion — sorted and tagged — before you finish talking.

This repo is two things at once:

1. **A setup wizard** — a slideshow web app that walks a non-technical person through the whole setup in about 10 minutes, with an AI helper on every slide.
2. **The capture webhook itself** — `/api/capture`, the small piece that translates a flat `{ idea, type }` from an iOS Shortcut into Notion's deeply nested API payload.

## The flow

```
Siri / Share Sheet / home-screen icon
    ↓ speaks or types the idea
iOS Shortcut
    ↓ POST { idea, type }
/api/capture
    ↓ builds Notion's nested payload
Notion  →  type "content"  → Content Ideas DB, Status = Inbox
           type "task"      → To-dos DB,         Status = Inbox
```

The webhook exists because Shortcuts can't reliably serialize Notion's nested JSON — smart quotes and Dictionary/Text type mismatches break it. Moving the transformation server-side keeps the Shortcut dumb.

## What the wizard does for the user

| Step | What happens |
| --- | --- |
| Notion key | They paste an internal integration secret; it's verified live against `/users/me`. |
| Databases | The wizard **creates** Content Ideas and To-dos with the correct columns, statuses and colours. No manual config to get wrong. |
| Hosting | They choose: a hosted capture link, or deploying their own copy to a free Vercel account. |
| Shortcuts | Step-by-step build instructions with their personal capture link ready to copy. |
| Test | One button sends a real capture and links to the row it created in Notion. |

Progress is saved to `localStorage`, so they can close the tab and come back.

## Two hosting modes, one file

`/api/capture` resolves credentials from whichever is present:

- **Hosted** — the Shortcut posts to `…/api/capture?key=<captureKey>`, and the key looks up an encrypted Notion token in the store.
- **Own Vercel** — no key; the deployment reads `NOTION_TOKEN`, `CONTENT_DB_ID` and `TASK_DB_ID` from its own environment.

## Running it locally

```bash
npm install
cp .env.example .env.local   # set APP_SECRET at minimum
npm run dev
```

## Deploying the wizard

Set `APP_SECRET`, and set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` before sharing it publicly — without them, hosted setups fall back to a local file that Vercel's filesystem does not persist. `OPENAI_API_KEY` is optional; without it the in-app helper answers from a built-in FAQ instead.
