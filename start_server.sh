#!/usr/bin/env bash
# RP Standalone Server Launcher
# Usage: ./start_server.sh [--debug] [--model MODEL_ID]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="$ROOT/.venv/bin/python"

BOOTSTRAP_PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 \
      && "$candidate" -c 'import sys; raise SystemExit(sys.version_info < (3, 11))'; then
    BOOTSTRAP_PYTHON="$candidate"
    break
  fi
done
if [ -z "$BOOTSTRAP_PYTHON" ]; then
  echo "[bootstrap] ERROR: Python 3.11 or newer was not found." >&2
  exit 1
fi

cd "$ROOT"
export PYTHONPATH=
"$BOOTSTRAP_PYTHON" "$ROOT/bootstrap.py"

echo "=== RP Standalone Server ==="
echo "Port: 8765"
echo "Python: $VENV_PYTHON"
echo

exec "$VENV_PYTHON" "$ROOT/backend/main.py" "$@"
