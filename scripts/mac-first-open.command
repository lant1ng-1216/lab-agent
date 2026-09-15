#!/bin/bash
# Lab Agent — macOS 首次打开助手（随 zip 分发）
# 清隔离属性并启动；若仍被 Gatekeeper 拦住，按提示到系统设置点「仍要打开」。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP=""
for candidate in \
  "$HERE/Lab Agent.app" \
  "$HERE/../Lab Agent.app" \
  "/Applications/Lab Agent.app"
do
  if [[ -d "$candidate" ]]; then
    APP="$candidate"
    break
  fi
done

if [[ -z "$APP" ]]; then
  osascript -e 'display dialog "找不到 Lab Agent.app。\n请先把 App 拖到「应用程序」，或与本脚本放在同一文件夹。" buttons {"好"} default button 1 with title "Lab Agent"'
  exit 1
fi

xattr -cr "$APP" 2>/dev/null || true
open "$APP"

osascript <<EOF
display dialog "已尝试打开 Lab Agent。

若仍弹出「无法验证」：
1. 打开「系统设置」→「隐私与安全性」
2. 找到 Lab Agent，点「仍要打开」

之后即可正常双击启动。" buttons {"知道了"} default button 1 with title "Lab Agent"
EOF
