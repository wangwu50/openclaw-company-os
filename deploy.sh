#!/usr/bin/env bash
set -e

REMOTE="wwc@192.168.31.239"
REMOTE_SRC="~/openclaw-company-os"
REMOTE_EXT="~/.openclaw/extensions/company"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> [1/4] 同步源文件到远程..."
rsync -az "$LOCAL_DIR/src/" "$REMOTE:$REMOTE_SRC/src/"
rsync -az "$LOCAL_DIR/ui/src/" "$REMOTE:$REMOTE_SRC/ui/src/"

echo "==> [2/4] 构建后端..."
ssh "$REMOTE" "cd $REMOTE_SRC && npm run build"

echo "==> [3/4] 构建前端..."
ssh "$REMOTE" "cd $REMOTE_SRC/ui && npm run build"

echo "==> [4/4] 发布到插件目录并重启 Openclaw..."
ssh "$REMOTE" "
  cp $REMOTE_SRC/index.js $REMOTE_EXT/index.js
  rm -f $REMOTE_EXT/db-*.js
  cp $REMOTE_SRC/db-*.js $REMOTE_EXT/ 2>/dev/null || true
  rsync -a $REMOTE_SRC/src/ $REMOTE_EXT/src/
  rsync -a $REMOTE_SRC/ui/dist/ $REMOTE_EXT/ui/dist/
  systemctl --user restart openclaw-gateway
  echo 'Openclaw 已重启'
"

echo "==> 部署完成！"
