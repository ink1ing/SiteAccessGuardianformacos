#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
OUT_DIR="$ROOT_DIR/dist"
BIN="$OUT_DIR/TouchIDAuth"
APP_DIR="$OUT_DIR/SiteGuardian.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"
CONTENTS_DIR="$APP_DIR/Contents"
INFO_PLIST="$CONTENTS_DIR/Info.plist"

# Ensure binary exists
if [[ ! -x "$BIN" ]]; then
  echo "[package] native binary missing; building first"
  "$ROOT_DIR/scripts/build_native.sh"
fi

echo "[package] creating app bundle -> $APP_DIR"
mkdir -p "$MACOS_DIR"

# Minimal Info.plist
cat > "$INFO_PLIST" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>SiteGuardian</string>
  <key>CFBundleIdentifier</key>
  <string>com.siteguardian.touchid</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleExecutable</key>
  <string>TouchIDAuth</string>
  <key>LSBackgroundOnly</key>
  <true/>
</dict>
</plist>
PLIST

cp -f "$BIN" "$MACOS_DIR/TouchIDAuth"
chmod +x "$MACOS_DIR/TouchIDAuth"

echo "[package] done: $APP_DIR"

