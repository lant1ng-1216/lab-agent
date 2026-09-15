#!/bin/bash
# 双击即可：删掉旧版 0.1.0，装上已签名的 0.1.1，并打开
set -e
SRC="/Users/Zhuanz/Desktop/lab-agent/release/mac-arm64/Lab Agent.app"
DEST="/Applications/Lab Agent.app"
echo "正在删除旧版并安装 Lab Agent 0.1.1…"
rm -rf "$DEST"
ditto "$SRC" "$DEST"
xattr -cr "$DEST" || true
codesign --verify --deep --strict "$DEST"
open "$DEST"
echo "完成。若弹出「无法验证」：系统设置 → 隐私与安全性 → 仍要打开"
sleep 8
