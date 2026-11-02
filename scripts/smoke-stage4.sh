#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:8787}"
STAMP="$(date +%s)"
A_ID="smoke4-a-${STAMP}-$$"
B_ID="smoke4-b-${STAMP}-$$"
C_ID="smoke4-c-${STAMP}-$$"
A_SECRET="$(openssl rand -hex 32)"
B_SECRET="$(openssl rand -hex 32)"
C_SECRET="$(openssl rand -hex 32)"

register() {
  local device_id="$1"
  local secret="$2"
  local name="$3"
  curl -fsS -X POST "${API_URL}/api/devices" \
    -H "content-type: application/json" \
    --data "{\"deviceId\":\"${device_id}\",\"secret\":\"${secret}\",\"name\":\"${name}\",\"platform\":\"smoke\"}" \
    >/dev/null
}

auth_post() {
  local device_id="$1"
  local secret="$2"
  local path="$3"
  local body="${4:-}"
  if [[ -n "${body}" ]]; then
    curl -fsS -X POST "${API_URL}${path}" \
      -H "content-type: application/json" \
      -H "Authorization: Bearer ${device_id}.${secret}" \
      --data "${body}"
  else
    curl -fsS -X POST "${API_URL}${path}" \
      -H "Authorization: Bearer ${device_id}.${secret}"
  fi
}

echo "Registering smoke devices..."
register "${A_ID}" "${A_SECRET}" "Smoke A"
register "${B_ID}" "${B_SECRET}" "Smoke B"
register "${C_ID}" "${C_SECRET}" "Smoke C"

echo "Testing nearby request/accept..."
auth_post "${A_ID}" "${A_SECRET}" "/api/peers/request" "{\"toDeviceId\":\"${B_ID}\"}" >/dev/null
auth_post "${B_ID}" "${B_SECRET}" "/api/peers/respond" "{\"fromDeviceId\":\"${A_ID}\",\"accept\":true}" >/dev/null

LINKED="$(curl -fsS "${API_URL}/api/peers" -H "Authorization: Bearer ${A_ID}.${A_SECRET}")"
node -e '
const body = JSON.parse(process.argv[1]);
if (!body.linked.some((peer) => peer.id === process.argv[2])) {
  console.error("Nearby request linking failed");
  process.exit(1);
}
' "${LINKED}" "${B_ID}"

echo "Testing invite create/redeem..."
INVITE="$(auth_post "${A_ID}" "${A_SECRET}" "/api/invites")"
CODE="$(node -e 'console.log(JSON.parse(process.argv[1]).code)' "${INVITE}")"
auth_post "${C_ID}" "${C_SECRET}" "/api/invites/redeem" "{\"code\":\"${CODE}\"}" >/dev/null

LINKED="$(curl -fsS "${API_URL}/api/peers" -H "Authorization: Bearer ${A_ID}.${A_SECRET}")"
node -e '
const body = JSON.parse(process.argv[1]);
if (!body.linked.some((peer) => peer.id === process.argv[2])) {
  console.error("Invite linking failed");
  process.exit(1);
}
console.log("Nearby and invite linking OK");
' "${LINKED}" "${C_ID}"

echo "Stage 4 smoke test passed."
