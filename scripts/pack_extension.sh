#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
OUT_DIR="$ROOT_DIR/release"
VER=$(grep -o '"version"\s*:\s*"[^"]\+"' "$ROOT_DIR/manifest.json" | sed -E 's/.*"([^"]+)"/\1/')
NAME="SiteAccessGuardian-extension-$VER.zip"

mkdir -p "$OUT_DIR"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

cp "$ROOT_DIR/manifest.json" "$TMP_DIR/" \
   && cp "$ROOT_DIR/background.js" "$TMP_DIR/" \
   && cp "$ROOT_DIR/content.js" "$TMP_DIR/" \
   && cp "$ROOT_DIR/popup.html" "$TMP_DIR/" \
   && cp "$ROOT_DIR/popup.js" "$TMP_DIR/"

(cd "$TMP_DIR" && zip -qr "$OUT_DIR/$NAME" .)
echo "[pack] created: $OUT_DIR/$NAME"

