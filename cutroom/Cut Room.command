#!/bin/bash
# Double-click to start Cut Room. Leave the window open while it works.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "Cut Room needs one free helper app called Node.js.\n\nClick OK to open its download page, download the macOS Installer, install it, then double-click Cut Room again." buttons {"OK"} default button 1 with title "Cut Room"'
  open "https://nodejs.org/en/download"
  exit 1
fi

if [ ! -d node_modules/ffmpeg-static ]; then
  echo "First time only: setting up Cut Room (about a minute)…"
  npm install --no-audit --no-fund || { echo "Setup failed — check your internet and double-click again."; read -r; exit 1; }
fi

node src/server.mjs
