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
  if [[ ! -e "$dest" ]]; then
    echo "Target package path not found: $dest"
    return 1
  fi

  # pnpm 下 node_modules/<pkg> 通常是软链，需落到真实目录（.pnpm/.../node_modules/<pkg>）
  local root_real dest_real
  root_real="$(cd "$ROOT" && pwd -P)"
  dest_real="$(cd "$dest" && pwd -P)"

  if [[ "$dest_real" == "$root_real" ]]; then
    echo "Skip copy for $dest (already linked to current repo)"
    return 0
  fi

  rm -rf "$dest_real/dist" "$dest_real/types"
  cp -R "$ROOT/dist" "$dest_real/dist"
  cp -R "$ROOT/types" "$dest_real/types"
  echo "Copied dist + types -> $dest_real (from $dest)"
}

copy_bundle "$SERVER_NM"
copy_bundle "$APP_NM"
echo "push-local: done (server + app)"
