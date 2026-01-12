#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-dev}"
ENV_FILE="deploy/targets/${TARGET}.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Target env file not found: $ENV_FILE"
  echo "Copy deploy/targets/${TARGET}.env.example to ${ENV_FILE} and fill DEPLOY_HOST/USER/PATH."
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ -z "${DEPLOY_HOST:-}" || -z "${DEPLOY_USER:-}" || -z "${DEPLOY_PATH:-}" ]]; then
  echo "DEPLOY_HOST/DEPLOY_USER/DEPLOY_PATH must be set in $ENV_FILE"
  exit 1
fi

echo "[deploy] building UI (mock mode)"
npm run build

echo "[deploy] syncing to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
rsync -avz --delete \
  dist/ \
  package.json package-lock.json tsconfig.json vite.config.ts \
  src/ server.js index.html index.css \
  "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH/"

echo "[deploy] installing deps and writing .env.mock on remote"
ssh "$DEPLOY_USER@$DEPLOY_HOST" bash -s <<'EOF'
set -e
cd "$DEPLOY_PATH"
npm install
cat > .env.mock <<'EOT'
MOCK_GPIO=1
AGENT_WS_URL=ws://localhost:4000/agent
AGENT_ID=dev-agent
AGENT_SECRET=secret
CENTRAL_AGENT_SECRET=secret
CENTRAL_PORT=4000
EOT
EOF

if [[ -n "${DEPLOY_SERVICES:-}" ]]; then
  echo "[deploy] restarting services: ${DEPLOY_SERVICES}"
  ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo systemctl restart ${DEPLOY_SERVICES}"
else
  echo "[deploy] DEPLOY_SERVICES not set; skipped service restart."
fi

echo "[deploy] done"
