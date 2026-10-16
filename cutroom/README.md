# Cut Room

Runs on Sophie's computer. Watches `Desktop/Cut Room Inbox` and any SD card,
copies the clips off, transcribes them, matches each to a script in Notion
(Content Ideas in Drafting/Filming/Editing, plus Brand Deals in script/film/edit
stages), cuts the best takes into script order, and shows the rough cuts at
http://localhost:4848. Approve uploads the cut (and optionally the raw clips) to
Google Drive › Cut Room, shares the folder with the editor, sets **Editor** on
the Notion page, moves it to the edit stage and @mentions them there.

Start: double-click `Cut Room.command` (Mac) or `npm start`. Needs Node 20+;
ffmpeg is bundled via `ffmpeg-static`.

The heavy lifting (Notion, OpenAI, Google token refresh) goes through the
deployed dashboard's `/api/cutroom/*` routes, authenticated with the dashboard
link key — no keys live on the computer except that link and a sealed Drive
token.

Files: raw clips in `~/Movies/Cut Room/Raw clips/<date>`, rough cuts in
`~/Movies/Cut Room/Rough cuts`, state in `~/Movies/Cut Room/cut-room.json`.

Env overrides (testing): `CUTROOM_PORT`, `CUTROOM_HOME`, `CUTROOM_INBOX`,
`CUTROOM_VOLUMES` (path-delimited list), `CUTROOM_CARD_DAYS`, `CUTROOM_NO_OPEN`,
`CUTROOM_FFMPEG`.

Download zip for her: `npm run cutroom:zip` in the repo root writes
`public/cut-room.zip` (served at `/cut-room.zip`); run it before deploying.
