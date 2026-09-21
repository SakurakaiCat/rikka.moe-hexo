#!/usr/bin/env bash
# Local preview launcher for the blog API (api/).
#
# Unlike the deployed service (systemd `rikka-api`, port 18080) this runs the
# freshly built bundle from this repository on its own port, so a preview site
# can talk to it without touching production.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Host secrets (DB path, NASA key, hash salts) are not committed to the repo;
# the preview picks them up at runtime when the operator provisioned them.
if [ -f /opt/rikka/blog.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /opt/rikka/blog.env
  set +a
fi

# Forced after the env file so the preview never collides with the live service,
# which owns 127.0.0.1:18080 (see api/index.ts: PREVIEW_* beats PORT/HOST).
export PREVIEW_HOST=0.0.0.0
export PREVIEW_PORT=18081

cd "$ROOT"
exec node api/dist/index.mjs
