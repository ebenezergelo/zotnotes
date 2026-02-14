#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script builds a macOS DMG and must be run on macOS."
  exit 1
fi

cd "$ROOT_DIR"

if [[ ! -d "node_modules" ]]; then
  echo "Installing npm dependencies..."
  npm install
fi

echo "Syncing app icons from macos/ ..."
npm run sync:icons

echo "Building macOS DMG with Tauri..."
npm run tauri build -- --bundles dmg

echo
echo "DMG output (expected):"
echo "  $ROOT_DIR/src-tauri/target/release/bundle/dmg"
