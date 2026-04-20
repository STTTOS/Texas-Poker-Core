#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVER_NM="/Users/yangxuanjing/Desktop/coding/wish_mono_server/node_modules/texas-poker-core"
APP_NM="/Users/yangxuanjing/Desktop/coding/texasPokerRN/node_modules/texas-poker-core"

pnpm run build
pnpm run test
pnpm run build

copy_bundle() {
  local dest="$1"
  cp -R "$ROOT/dist" "$dest"
  cp -R "$ROOT/types" "$dest"
  echo "Copied dist + types -> $dest"
}

copy_bundle "$SERVER_NM"
copy_bundle "$APP_NM"
echo "push-local: done (server + app)"
