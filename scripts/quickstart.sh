#!/usr/bin/env bash
set -euo pipefail

echo "=== Site Access Guardian Quickstart ==="
echo "1) 在 Chrome 打开 chrome://extensions/ → 打开‘开发者模式’ → ‘加载已解压的扩展程序’指向当前目录"
echo "2) 复制扩展 ID (形如 abcdefghijklmnopqrstuvwxyz)"
read -rp "请输入扩展 ID: " EXT_ID
if [[ -z "$EXT_ID" ]]; then echo "未输入扩展 ID"; exit 1; fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

"$SCRIPT_DIR/install_host.sh" "$EXT_ID"

echo "\n完成！请在 chrome://extensions/ 里点击‘重新加载’，然后访问受控站点测试 Touch ID 验证。"

