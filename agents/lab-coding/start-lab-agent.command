#!/bin/bash
# Lab Agent Coding 启动器（DeepSeek 后端）
#
# 用法：
#   ./start-lab-agent.command                  # 在 agents/lab-coding 目录启动
#   ./start-lab-agent.command /path/to/project # 在指定项目目录启动（推荐）
#
# 配置：lab-agent.env（优先）；若仍有旧版 freecode.env 则作兼容回退
# 模板：lab-agent.env.example

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

TARGET_DIR="${1:-$SCRIPT_DIR}"
if [ ! -d "$TARGET_DIR" ]; then
  echo "[x] 目标目录不存在：$TARGET_DIR"
  exit 1
fi

BASE_URL_DEFAULT="https://api.deepseek.com"

cd "$SCRIPT_DIR" || exit 1

ENV_FILE=""
if [ -f "./lab-agent.env" ]; then
  ENV_FILE="./lab-agent.env"
elif [ -f "./freecode.env" ]; then
  ENV_FILE="./freecode.env"
  echo "[!] 正在使用旧版 freecode.env — 建议改名为 lab-agent.env"
fi

if [ -n "$ENV_FILE" ]; then
  echo "[*] 已加载 $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

# 官方 Base URL → 引擎内部端点（DeepSeek 自动补全路径，对用户不可见）
RAW_BASE="${BASE_URL:-${ANTHROPIC_BASE_URL:-$BASE_URL_DEFAULT}}"
RAW_BASE="${RAW_BASE%/}"
RAW_BASE="${RAW_BASE%/v1}"
case "$RAW_BASE" in
  *deepseek*)
    case "$RAW_BASE" in
      */anthropic) ENGINE_BASE="$RAW_BASE" ;;
      *) ENGINE_BASE="${RAW_BASE}/anthropic" ;;
    esac
    ;;
  *) ENGINE_BASE="$RAW_BASE" ;;
esac
export ANTHROPIC_BASE_URL="$ENGINE_BASE"

# Lab Agent uses one product-owned profile shared with the desktop app.
# On macOS Electron's userData is ~/Library/Application Support/Lab Agent.
LAB_AGENT_HOME="${LAB_AGENT_HOME:-$HOME/Library/Application Support/Lab Agent/lab-coding-config}"
case "$LAB_AGENT_HOME" in
  /*) ;;
  *) LAB_AGENT_HOME="$HOME/Library/Application Support/Lab Agent/lab-coding-config" ;;
esac
mkdir -p "$LAB_AGENT_HOME"
export LAB_AGENT_HOME
# The engine still reads this legacy variable internally; force it to Lab's
# profile and ignore any inherited Claude Code / Cowork memory redirection.
CLAUDE_CONFIG_DIR="$LAB_AGENT_HOME"
export CLAUDE_CONFIG_DIR
unset CLAUDE_CODE_REMOTE_MEMORY_DIR CLAUDE_COWORK_MEMORY_PATH_OVERRIDE CLAUDE_COWORK_MEMORY_EXTRA_GUIDELINES CLAUDE_CODE_REMOTE CLAUDE_CODE_USE_COWORK_PLUGINS CLAUDE_CODE_DISABLE_AUTO_MEMORY CLAUDE_CODE_SIMPLE

KEY="${DEEPSEEK_API_KEY:-${API_KEY:-${ANTHROPIC_AUTH_TOKEN:-${ANTHROPIC_API_KEY:-}}}}"
PLACEHOLDER="sk-在此粘贴你的密钥"
if [ -z "$KEY" ] || [ "$KEY" = "$PLACEHOLDER" ] || [ "$KEY" = "sk-在此粘贴你的DeepSeek密钥" ]; then
  echo ""
  echo "未检测到 DeepSeek API Key。"
  echo "申请地址：https://platform.deepseek.com/api_keys"
  echo ""
  printf "请粘贴你的 DeepSeek API Key（输入不回显，直接回车取消）："
  read -rs KEY
  echo ""
  if [ -z "$KEY" ]; then
    echo "[!] 未输入密钥，退出。"
    exit 1
  fi
  export DEEPSEEK_API_KEY="$KEY"
  export ANTHROPIC_AUTH_TOKEN="$KEY"
  printf "是否保存到 lab-agent.env 以便下次免输入？(y/N)："
  read -r SAVE
  if [ "$SAVE" = "y" ] || [ "$SAVE" = "Y" ]; then
    if [ -f "./lab-agent.env.example" ]; then
      cp ./lab-agent.env.example ./lab-agent.env
    else
      touch ./lab-agent.env
    fi
    if grep -q "^DEEPSEEK_API_KEY=" ./lab-agent.env 2>/dev/null; then
      tmp="$(mktemp)"
      sed "s|^DEEPSEEK_API_KEY=.*|DEEPSEEK_API_KEY=$KEY|" ./lab-agent.env > "$tmp" && mv "$tmp" ./lab-agent.env
    elif grep -q "^ANTHROPIC_AUTH_TOKEN=" ./lab-agent.env 2>/dev/null; then
      tmp="$(mktemp)"
      sed "s|^ANTHROPIC_AUTH_TOKEN=.*|ANTHROPIC_AUTH_TOKEN=$KEY|" ./lab-agent.env > "$tmp" && mv "$tmp" ./lab-agent.env
    else
      echo "DEEPSEEK_API_KEY=$KEY" >> ./lab-agent.env
    fi
    chmod 600 ./lab-agent.env
    echo "[*] 已保存到 lab-agent.env（权限 600）"
  fi
else
  export DEEPSEEK_API_KEY="$KEY"
  export ANTHROPIC_AUTH_TOKEN="$KEY"
fi

MODEL_NAME="${MODEL:-${ANTHROPIC_MODEL:-deepseek-flash}}"
export ANTHROPIC_MODEL="$MODEL_NAME"
export ANTHROPIC_DEFAULT_OPUS_MODEL="${ANTHROPIC_DEFAULT_OPUS_MODEL:-$MODEL_NAME}"
export ANTHROPIC_DEFAULT_SONNET_MODEL="${ANTHROPIC_DEFAULT_SONNET_MODEL:-$MODEL_NAME}"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="${ANTHROPIC_DEFAULT_HAIKU_MODEL:-$MODEL_NAME}"
export CLAUDE_CODE_SUBAGENT_MODEL="${CLAUDE_CODE_SUBAGENT_MODEL:-$MODEL_NAME}"

echo "[*] 正在校验 DeepSeek 端点 ..."
code="$(curl -s -o /dev/null -w '%{http_code}' -m 20 \
  -X POST "${ANTHROPIC_BASE_URL}/v1/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: ${ANTHROPIC_AUTH_TOKEN}" \
  -H "anthropic-version: 2023-06-01" \
  -d "{\"model\":\"${ANTHROPIC_DEFAULT_HAIKU_MODEL}\",\"max_tokens\":8,\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}" 2>/dev/null)"

case "$code" in
  200) echo "[+] 鉴权与网络正常" ;;
  401|403) echo "[x] 密钥无效或无权访问（HTTP $code）。请检查 API Key 是否正确、账户是否有余额。"; exit 1 ;;
  000) echo "[x] 无法连接 API，请检查网络。"; exit 1 ;;
  *)   echo "[!] 端点返回 HTTP $code，仍尝试启动 ..." ;;
esac

echo "[*] Lab Agent"
echo "[*] 模型：$ANTHROPIC_MODEL"
echo "[*] 工作目录：$TARGET_DIR"
echo ""
cd "$TARGET_DIR" || exit 1
exec "$SCRIPT_DIR/cli-dev"
