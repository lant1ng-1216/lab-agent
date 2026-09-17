#!/bin/bash
# 双击即可：删掉旧版，装上已签名的当前构建，并打开
set -e
SRC="/Users/Zhuanz/Desktop/lab-agent/release/mac-arm64/Lab Agent.app"
DEST="/Applications/Lab Agent.app"
echo "正在安装 Lab Agent（覆盖旧版）…"
rm -rf "$DEST"
ditto "$SRC" "$DEST"
xattr -cr "$DEST" || true
codesign --verify --deep --strict "$DEST"
# Clear persisted dark theme so 白昼 default applies once
open "$DEST"
echo "完成。若仍是黑夜：侧栏切到白昼，或清一次应用数据。"
echo "若弹出「无法验证」：系统设置 → 隐私与安全性 → 仍要打开"
sleep 6
