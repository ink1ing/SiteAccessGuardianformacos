#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 EXTENSION_ID [--edge] [--use-binary]" >&2
  exit 1
fi

EXT_ID="$1"; shift || true
BROWSER="chrome" # or edge
MODE="app"       # or binary

while [[ $# -gt 0 ]]; do
  case "$1" in
    --edge) BROWSER="edge" ; shift ;;
    --use-binary) MODE="binary" ; shift ;;
    *) echo "Unknown option: $1" >&2 ; exit 1 ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
OUT_DIR="$ROOT_DIR/dist"

if [[ "$BROWSER" == "chrome" ]]; then
  HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
elif [[ "$BROWSER" == "edge" ]]; then
  HOST_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
else
  echo "Unsupported browser: $BROWSER" >&2
  exit 1
fi

mkdir -p "$HOST_DIR"

HOST_NAME="com.siteguardian.touchid"
HOST_FILE="$HOST_DIR/$HOST_NAME.json"

# Determine executable path
if [[ "$MODE" == "app" ]]; then
  APP_DIR="$OUT_DIR/SiteGuardian.app"
  if [[ ! -d "$APP_DIR" ]]; then
    echo "[install] app bundle missing; packaging first"
    "$ROOT_DIR/scripts/package_app.sh"
  fi
  EXEC_PATH="$APP_DIR/Contents/MacOS/TouchIDAuth"
else
  # Use raw binary
  BIN="$OUT_DIR/TouchIDAuth"
  if [[ ! -x "$BIN" ]]; then
    echo "[install] binary missing; building first"
    "$ROOT_DIR/scripts/build_native.sh"
  fi
  EXEC_PATH="$BIN"
fi

cat > "$HOST_FILE" << JSON
{
  "name": "$HOST_NAME",
  "description": "Site Guardian Touch ID Authentication",
  "path": "${EXEC_PATH}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXT_ID}/"
  ]
}
JSON

echo "[install] Host manifest installed: $HOST_FILE"
echo "[install] Executable path: $EXEC_PATH"

