#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

REMOTE_HOST="${REMOTE_HOST:-101.36.117.121}"
REMOTE_PORT="${REMOTE_PORT:-22}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_PATH="${REMOTE_PATH:-/var/www/amigo}"
BUILD_FIRST="${BUILD_FIRST:-1}"
UPLOAD_CONFIGS="${UPLOAD_CONFIGS:-1}"

SSH_CONTROL_PATH="${SSH_CONTROL_PATH:-$HOME/.ssh/codex-amigo-%r@%h:%p}"
SSH_BASE_OPTS=(
  -p "${REMOTE_PORT}"
  -o ControlMaster=auto
  -o ControlPersist=10m
  -o ControlPath="${SSH_CONTROL_PATH}"
  -o StrictHostKeyChecking=accept-new
)

ssh_cmd() {
  ssh "${SSH_BASE_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$@"
}

rsync_cmd() {
  rsync -az --delete -e "ssh ${SSH_BASE_OPTS[*]}" "$@"
}

cleanup() {
  ssh -O exit "${SSH_BASE_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

if [[ "${BUILD_FIRST}" == "1" ]]; then
  cd "${ROOT_DIR}"
  bun install
  bun run --filter @amigo-llm/amigo build
fi

ssh_cmd "mkdir -p '${REMOTE_PATH}/frontend' '${REMOTE_PATH}/backend/dist/server' '${REMOTE_PATH}/backend/dist/data' '${REMOTE_PATH}/backend/dist/vendor' '${REMOTE_PATH}/backend/assets' '${REMOTE_PATH}/shared' '${REMOTE_PATH}/cache'"

rsync_cmd \
  "${ROOT_DIR}/packages/amigo/dist/web/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/frontend/"

rsync_cmd \
  "${ROOT_DIR}/packages/amigo/dist/server/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/backend/dist/server/"

rsync_cmd \
  "${ROOT_DIR}/packages/amigo/dist/data/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/backend/dist/data/"

rsync_cmd \
  "${ROOT_DIR}/packages/amigo/dist/vendor/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/backend/dist/vendor/"

rsync -az -e "ssh ${SSH_BASE_OPTS[*]}" \
  "${ROOT_DIR}/packages/amigo/dist/package.json" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/backend/dist/package.json"

rsync_cmd \
  "${ROOT_DIR}/packages/amigo/assets/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/backend/assets/"

rsync -az -e "ssh ${SSH_BASE_OPTS[*]}" \
  "${ROOT_DIR}/ops/deploy/deploy-amigo.sh" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/backend/deploy-amigo.sh"

rsync -az -e "ssh ${SSH_BASE_OPTS[*]}" \
  "${ROOT_DIR}/ops/deploy/amigo.env.example" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/backend/amigo.env.example"

if [[ "${UPLOAD_CONFIGS}" == "1" ]]; then
  rsync -az -e "ssh ${SSH_BASE_OPTS[*]}" \
    "${ROOT_DIR}/ops/systemd/amigo.service" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/backend/amigo.service"

  rsync -az -e "ssh ${SSH_BASE_OPTS[*]}" \
    "${ROOT_DIR}/ops/caddy/Caddyfile.example" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/backend/Caddyfile"
fi

ssh_cmd "chmod +x '${REMOTE_PATH}/backend/deploy-amigo.sh'"

cat <<EOF
Upload completed.

Remote host: ${REMOTE_USER}@${REMOTE_HOST}
Deploy root: ${REMOTE_PATH}

Uploaded:
- ${REMOTE_PATH}/frontend
- ${REMOTE_PATH}/backend/dist/server
- ${REMOTE_PATH}/backend/dist/data
- ${REMOTE_PATH}/backend/dist/vendor
- ${REMOTE_PATH}/backend/dist/package.json
- ${REMOTE_PATH}/backend/assets
- ${REMOTE_PATH}/backend/deploy-amigo.sh
- ${REMOTE_PATH}/backend/amigo.env.example
EOF

if [[ "${UPLOAD_CONFIGS}" == "1" ]]; then
  cat <<EOF
- ${REMOTE_PATH}/backend/amigo.service
- ${REMOTE_PATH}/backend/Caddyfile
EOF
fi

cat <<EOF

Next steps on the server:
1. Ensure ${REMOTE_PATH}/shared/amigo.env exists.
2. Optionally copy:
   sudo cp ${REMOTE_PATH}/backend/amigo.service /etc/systemd/system/amigo.service
   sudo cp ${REMOTE_PATH}/backend/Caddyfile /etc/caddy/Caddyfile
3. Run:
   AMIGO_DEPLOY_ROOT=${REMOTE_PATH} bash ${REMOTE_PATH}/backend/deploy-amigo.sh
EOF
