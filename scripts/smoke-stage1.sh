#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:8787}"
STAMP="$(date +%s)"
A_ID="smoke-a-${STAMP}-$$"
B_ID="smoke-b-${STAMP}-$$"
A_SECRET="$(openssl rand -hex 32)"
B_SECRET="$(openssl rand -hex 32)"

register() {
  local device_id="$1"
  local secret="$2"
  local name="$3"

  curl -fsS -X POST "${API_URL}/api/devices" \
    -H "content-type: application/json" \
    --data "{\"deviceId\":\"${device_id}\",\"secret\":\"${secret}\",\"name\":\"${name}\",\"platform\":\"smoke\"}" \
    >/dev/null
}

echo "Registering smoke devices..."
register "${A_ID}" "${A_SECRET}" "Smoke A"
register "${B_ID}" "${B_SECRET}" "Smoke B"

UNAUTHORIZED_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "${API_URL}/api/peers")"
if [[ "${UNAUTHORIZED_STATUS}" != "401" ]]; then
  echo "Expected unauthenticated /api/peers to return 401, got ${UNAUTHORIZED_STATUS}" >&2
  exit 1
fi

PEERS="$(curl -fsS "${API_URL}/api/peers" \
  -H "Authorization: Bearer ${A_ID}.${A_SECRET}")"

node -e '
const body = JSON.parse(process.argv[1]);
const expected = process.argv[2];
if (!Array.isArray(body.local) || !body.local.some((peer) => peer.id === expected)) {
  console.error("Local peer discovery failed");
  process.exit(1);
}
console.log("Local peer discovery OK:", expected);
' "${PEERS}" "${B_ID}"

echo "Stage 1 smoke test passed."
