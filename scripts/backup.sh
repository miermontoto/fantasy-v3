#!/usr/bin/env bash
# wrapper del backup de sqlite de platform (rotación recent/ + weekly/)
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$REPO_DIR/platform/tooling/backup/backup-sqlite.sh" \
  --app fantasy --mode docker --container fantasy-fantasy-1 \
  --db /app/data/fantasy.db --dest "$REPO_DIR/data/backups"
