#!/usr/bin/env bash
# Gắn watcher đánh thức (ops/agent-watch.mjs) vào VÒNG ĐỜI của `dsh web`:
# dsh web lên ⇒ watcher chạy; dsh web tắt ⇒ watcher dừng. Không cần launchd/Task Scheduler.
#
#   bash ops/install-agent-watch-plugin.sh                 # profile web, agent MAC
#   AGENT_NAME=WIN bash ops/install-agent-watch-plugin.sh  # cho máy Windows
#   bash ops/install-agent-watch-plugin.sh web /duong/dan/repo
set -euo pipefail

DSH_ROOT="${DSH_HOME:-$HOME/.dsh}"
PROFILE="${1:-web}"
REPO="${2:-$(cd "$(dirname "$0")/.." && pwd)}"
AGENT="${AGENT_NAME:-MAC}"
PLUGIN="dsh-plugin-agent-watch"
SRC="$(cd "$(dirname "$0")/dsh-plugin-agent-watch" && pwd)"
DEST="$DSH_ROOT/profiles/node_modules/$PLUGIN"
PATCH="$DSH_ROOT/profiles/$PROFILE/cordis.patch.yml"

[ -d "$DSH_ROOT/profiles/$PROFILE" ] || { echo "! Không thấy profile '$PROFILE' trong $DSH_ROOT/profiles"; exit 1; }
[ -f "$REPO/ops/agent-watch.mjs" ] || { echo "! Không thấy $REPO/ops/agent-watch.mjs"; exit 1; }

mkdir -p "$DEST"
cp "$SRC/index.js" "$SRC/package.json" "$DEST/"
echo "✓ plugin: $DEST"

if grep -q "$PLUGIN" "$PATCH" 2>/dev/null; then
  echo "✓ patch đã có dòng $PLUGIN — không thêm lại"
else
  cp "$PATCH" "$PATCH.bak-$(date +%s)"
  cat >> "$PATCH" <<YAML

# Watcher danh thuc (ops/agent-watch.mjs) song cung vong doi cua \`dsh $PROFILE\`.
- insert:
    - id: agent-watch
      name: '$PLUGIN'
      config:
        repo: $REPO
        agentName: $AGENT
        interval: 20
        auto: true
YAML
  echo "✓ đã thêm dòng vào $PATCH (đã sao lưu bản cũ)"
fi

echo
echo "Kiểm tra:  dsh --profile $PROFILE --dump-config | grep -A4 agent-watch"
echo "Hiệu lực:  lần tới khởi động \`dsh $PROFILE\` trong terminal — watcher tự chạy, tắt cùng dsh."
