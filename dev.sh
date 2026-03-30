#!/usr/bin/env bash
# 一人公司 OS — 本地开发启动脚本
# 用法: bash extensions/company/dev.sh
#       bash extensions/company/dev.sh --no-open   # 不自动打开浏览器
#       bash extensions/company/dev.sh --rebuild    # 强制重新构建 UI
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
UI_DIR="$SCRIPT_DIR/ui"
PORT=18789
CONFIG="$HOME/.openclaw/openclaw.json"

# ── Colors ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}!${RESET}  $*"; }
err()  { echo -e "  ${RED}✗${RESET}  $*"; }
step() { echo -e "\n${BOLD}$*${RESET}"; }

# ── Args ─────────────────────────────────────────────────────────────────────
NO_OPEN=false
FORCE_REBUILD=false
for arg in "$@"; do
  case "$arg" in
    --no-open)   NO_OPEN=true ;;
    --rebuild)   FORCE_REBUILD=true ;;
    --help|-h)
      echo "用法: $0 [--no-open] [--rebuild]"
      echo "  --no-open   不自动打开浏览器"
      echo "  --rebuild   强制重新构建 UI"
      exit 0 ;;
  esac
done

echo -e "\n${BOLD}🏢 一人公司 OS — 本地启动${RESET}"

# ── 1. Prerequisites ─────────────────────────────────────────────────────────
step "[1/4] 检查环境"

if ! command -v node &>/dev/null; then err "需要 Node.js (>=22)"; exit 1; fi
if ! command -v pnpm &>/dev/null; then err "需要 pnpm"; exit 1; fi
ok "Node $(node -v)  /  pnpm $(pnpm -v)"

# ── 2. Config check ───────────────────────────────────────────────────────────
step "[2/4] 检查配置"

mkdir -p "$HOME/.openclaw"
if [ ! -f "$CONFIG" ]; then
  echo '{}' > "$CONFIG"
  warn "~/.openclaw/openclaw.json 已创建（空配置）"
fi

# Read current config values via Node (avoids jq dependency)
read_cfg() {
  node -e "
    try {
      const c = JSON.parse(require('fs').readFileSync('$CONFIG','utf8'));
      const v = ('$1'.split('.').reduce((o,k)=>o?.[k], c));
      if (v !== undefined && v !== null) process.stdout.write(String(v));
    } catch {}
  " 2>/dev/null || true
}

# Ensure company plugin is enabled
COMPANY_ENABLED=$(read_cfg "plugins.entries.company.enabled")
if [ "$COMPANY_ENABLED" != "true" ]; then
  warn "plugins.entries.company.enabled 未设置，正在写入..."
  cd "$REPO_ROOT"
  pnpm openclaw config set plugins.entries.company.enabled true
fi
ok "company 插件已启用"

# Ensure gateway auth token exists
TOKEN=$(read_cfg "gateway.auth.token")
if [ -z "$TOKEN" ]; then
  TOKEN=$(node -e "const {randomBytes}=require('crypto'); process.stdout.write(randomBytes(24).toString('hex'))")
  cd "$REPO_ROOT"
  pnpm openclaw config set gateway.auth.mode token
  pnpm openclaw config set gateway.auth.token "$TOKEN"
  ok "已生成 gateway token: $TOKEN"
else
  ok "gateway token: ${TOKEN:0:8}…"
fi

# Check if any AI model is configured
HAS_MODEL=$(node -e "
  try {
    const c = JSON.parse(require('fs').readFileSync('$CONFIG','utf8'));
    const p = c?.models?.providers ?? {};
    const hasKey = Object.values(p).some(v => v?.apiKey || v?.baseUrl);
    const hasAgent = c?.agents?.defaults?.model;
    process.stdout.write((hasKey || hasAgent) ? 'yes' : 'no');
  } catch { process.stdout.write('no'); }
" 2>/dev/null || echo "no")

if [ "$HAS_MODEL" != "yes" ]; then
  echo ""
  warn "未检测到 AI 模型配置。"
  echo "       请通过以下方式之一配置 Anthropic API key："
  echo ""
  echo "         pnpm openclaw config set models.providers.anthropic.apiKey sk-ant-..."
  echo "         # 或直接编辑 ~/.openclaw/openclaw.json"
  echo ""
  read -rp "       输入 ANTHROPIC_API_KEY（回车跳过）: " API_KEY
  if [ -n "$API_KEY" ]; then
    cd "$REPO_ROOT"
    pnpm openclaw config set models.providers.anthropic.apiKey "$API_KEY"
    ok "API key 已写入"
  else
    warn "跳过 API key 设置，员工 Agent 可能无法运行"
  fi
else
  ok "AI 模型已配置"
fi

# ── 3. Build UI ───────────────────────────────────────────────────────────────
step "[3/4] 构建 UI"

DIST="$UI_DIR/dist/index.html"
NEED_BUILD=false

if $FORCE_REBUILD; then
  NEED_BUILD=true
  warn "--rebuild: 强制重新构建"
elif [ ! -f "$DIST" ]; then
  NEED_BUILD=true
  warn "dist 不存在"
else
  # Rebuild if any source file is newer than dist/index.html
  if find "$UI_DIR/src" \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) -newer "$DIST" 2>/dev/null | grep -q .; then
    NEED_BUILD=true
    warn "src 文件已更新"
  fi
fi

if $NEED_BUILD; then
  cd "$UI_DIR"
  if [ ! -d node_modules ]; then
    echo "       安装 UI 依赖..."
    pnpm install --frozen-lockfile 2>&1 | tail -3
  fi
  echo "       构建中..."
  pnpm build 2>&1 | tail -5
  ok "UI 构建完成 → ui/dist/"
else
  ok "UI 已是最新，跳过构建（--rebuild 可强制重建）"
fi

# ── 4. Start gateway ──────────────────────────────────────────────────────────
step "[4/4] 启动 Gateway"

# Kill any existing process on the port
EXISTING_PID=$(lsof -ti:"$PORT" 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
  warn "端口 $PORT 已被占用 (PID $EXISTING_PID)，正在关闭..."
  kill -9 $EXISTING_PID 2>/dev/null || true
  sleep 1
fi

URL="http://localhost:${PORT}/company?token=${TOKEN}"
echo ""
echo -e "  ${BOLD}🔗 公司大厅：${GREEN}${URL}${RESET}"
echo ""

if ! $NO_OPEN; then
  # Open browser after 3s (give gateway time to start)
  if command -v xdg-open &>/dev/null; then
    (sleep 3 && xdg-open "$URL") &>/dev/null &
  elif command -v open &>/dev/null; then
    (sleep 3 && open "$URL") &>/dev/null &
  fi
fi

echo -e "  Gateway 日志如下，Ctrl-C 退出\n"
cd "$REPO_ROOT"
exec pnpm openclaw gateway run --bind loopback --port "$PORT" --force
