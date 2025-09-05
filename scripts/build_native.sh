#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
SRC="$ROOT_DIR/native_app_swift.swift"
OUT_DIR="$ROOT_DIR/dist"
BIN="$OUT_DIR/TouchIDAuth"

mkdir -p "$OUT_DIR"

echo "[build] compiling native host -> $BIN"
if command -v xcrun >/dev/null 2>&1; then
  xcrun swiftc -O -framework LocalAuthentication -o "$BIN" "$SRC"
else
  swiftc -O -framework LocalAuthentication -o "$BIN" "$SRC"
fi

# Ad-hoc codesign to avoid Gatekeeper prompts during dev
if command -v codesign >/dev/null 2>&1; then
  codesign -s - --force --timestamp=none "$BIN" || true
fi

echo "[build] done: $BIN"

