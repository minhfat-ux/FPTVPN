#!/usr/bin/env bash
# Cai plugin AgentTeams vao profile DSH — chay NGOAI harness (terminal thuong).
# Xem docs/TASK-dsh-agent-teams-upgrade.md.
#
#   bash ops/install-agent-teams.sh
#   bash ops/install-agent-teams.sh --profile headless
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$HERE/install-agent-teams.mjs" "$@"
