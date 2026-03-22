#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="${AMIGO_DEPLOY_ROOT:-$(cd "${APP_DIR}/.." && pwd)}"
SHARED_DIR="${SHARED_DIR:-${DEPLOY_ROOT}/shared}"
ENV_FILE="${AMIGO_ENV_FILE:-${SHARED_DIR}/amigo.env}"

run_systemctl() {
  if command -v sudo >/dev/null 2>&1; then
    sudo systemctl "$@"
    return
  fi
  systemctl "$@"
}

mkdir -p "${SHARED_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
. "${ENV_FILE}"
set +a

SANDBOX_IMAGE="${AMIGO_SANDBOX_IMAGE:-ai_sandbox}"
SYSTEMD_SERVICE="${AMIGO_SYSTEMD_SERVICE:-amigo}"
SANDBOX_ASSETS_DIR="${AMIGO_SANDBOX_ASSETS_DIR:-${APP_DIR}/assets}"

export BUN_INSTALL="${BUN_INSTALL:-${HOME}/.bun}"
export PATH="${BUN_INSTALL}/bin:${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required on the server" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required on the server" >&2
  exit 1
fi

if [[ ! -d "${APP_DIR}/dist/server" ]]; then
  echo "Missing backend bundle: ${APP_DIR}/dist/server" >&2
  exit 1
fi

if [[ ! -f "${SANDBOX_ASSETS_DIR}/Dockerfile" ]]; then
  echo "Missing sandbox Dockerfile: ${SANDBOX_ASSETS_DIR}/Dockerfile" >&2
  exit 1
fi

DOCKER_BUILDKIT=1 docker build -t "${SANDBOX_IMAGE}" "${SANDBOX_ASSETS_DIR}"

run_systemctl daemon-reload
run_systemctl restart "${SYSTEMD_SERVICE}"
run_systemctl --no-pager --full status "${SYSTEMD_SERVICE}" || true
