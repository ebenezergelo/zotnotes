#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_FILE="$ROOT_DIR/macos/1024x1024/Shape.png"
DST_DIR="$ROOT_DIR/src-tauri/icons"
TAURI_CLI="$ROOT_DIR/node_modules/.bin/tauri"

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Missing required icon source: $file" >&2
    exit 1
  fi
}

require_executable() {
  local file="$1"
  if [[ ! -x "$file" ]]; then
    echo "Missing required executable: $file" >&2
    exit 1
  fi
}

require_file "$SRC_FILE"
require_executable "$TAURI_CLI"

mkdir -p "$DST_DIR"
"$TAURI_CLI" icon "$SRC_FILE" --output "$DST_DIR"
rm -rf "$DST_DIR/icon.iconset"

echo "Synced app icons from $SRC_FILE to $DST_DIR"
