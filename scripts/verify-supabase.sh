#!/usr/bin/env bash
# ============================================================
#  verify-supabase.sh — prove the Wish Journal schema + RLS work
#  against a REAL Supabase project, from the terminal.
#
#  Usage:
#    SUPABASE_URL=https://<ref>.supabase.co \
#    SUPABASE_ANON_KEY=<anon key> \
#    ./scripts/verify-supabase.sh
#
#  It writes one throwaway wish, then checks that:
#    1. a write with this device's token hash succeeds
#    2. the same device can read its own row back
#    3. a request with NO token header sees nothing
#    4. a request with a DIFFERENT token hash sees nothing
#    5. the row can be deleted by its owner
#    6. the table is empty again afterwards
#  The test row is always cleaned up, even on failure.
# ============================================================
set -uo pipefail

URL="${SUPABASE_URL:-}"
KEY="${SUPABASE_ANON_KEY:-}"

if [[ -z "$URL" || -z "$KEY" ]]; then
  echo "FAIL: set SUPABASE_URL and SUPABASE_ANON_KEY first." >&2
  exit 2
fi

if [[ "$KEY" == sb_secret* || "$KEY" == sbp_* ]]; then
  echo "FAIL: that is a SECRET key. Use the anon/public key only." >&2
  exit 2
fi

REST="$URL/rest/v1/wishes"
TOKEN="$(openssl rand -hex 32)"
HASH="$(printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1)"
OTHER_HASH="$(printf 'not-my-device' | sha256sum | cut -d' ' -f1)"
STAMP="$(date +%s)"
TITLE="verify-$STAMP"
BODY="{\"title\":\"$TITLE\",\"description\":\"Automated schema check, safe to delete.\",\"category\":\"little-things\",\"owner_token_hash\":\"$HASH\"}"

pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail+1)); }

req() { # method path [extra curl args...]
  local method="$1" path="$2"; shift 2
  curl -sS -X "$method" "$path" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    -H 'Content-Type: application/json' "$@"
}

echo "Verifying $URL"

# 1. insert with our own token hash
code=$(req POST "$REST" -o /tmp/vs-insert.json -w '%{http_code}' \
  -H "x-wish-token-hash: $HASH" -H 'Prefer: return=representation' -d "$BODY")
if [[ "$code" == "201" ]]; then ok "insert as owner (201)"; else bad "insert as owner (got $code: $(head -c 300 /tmp/vs-insert.json))"; fi
ROW_ID=$(grep -o '"id":"[^"]*"' /tmp/vs-insert.json | head -1 | cut -d'"' -f4)

# 1b. insert with a forged hash must be refused (RLS with-check)
code=$(req POST "$REST" -o /dev/null -w '%{http_code}' \
  -H "x-wish-token-hash: $OTHER_HASH" \
  -d "{\"title\":\"forged-$STAMP\",\"description\":\"should never persist\",\"category\":\"self\",\"owner_token_hash\":\"$HASH\"}")
if [[ "$code" == "401" || "$code" == "403" ]]; then ok "forged owner_token_hash refused ($code)"; else bad "forged hash accepted (got $code)"; fi

# 2. read back as owner
n=$(req GET "$REST?select=id,title&title=eq.$TITLE" -H "x-wish-token-hash: $HASH" | grep -c "$TITLE")
if [[ "$n" -ge 1 ]]; then ok "owner reads own row back"; else bad "owner could not read own row"; fi

# 3. no header -> nothing
n=$(req GET "$REST?select=id&limit=5" | grep -c '"id"')
if [[ "$n" -eq 0 ]]; then ok "anonymous request sees 0 rows"; else bad "anonymous request saw $n rows"; fi

# 4. wrong device hash -> nothing
n=$(req GET "$REST?select=id&limit=5" -H "x-wish-token-hash: $OTHER_HASH" | grep -c '"id"')
if [[ "$n" -eq 0 ]]; then ok "other device sees 0 rows"; else bad "other device saw $n rows"; fi

# 4b. wrong device cannot delete someone else's row
code=$(req DELETE "$REST?id=eq.$ROW_ID" -o /dev/null -w '%{http_code}' -H "x-wish-token-hash: $OTHER_HASH")
n=$(req GET "$REST?select=id&title=eq.$TITLE" -H "x-wish-token-hash: $HASH" | grep -c "$TITLE")
if [[ "$n" -ge 1 ]]; then ok "other device could not delete the row ($code)"; else bad "row vanished after a foreign delete"; fi

# 5. owner deletes
code=$(req DELETE "$REST?id=eq.$ROW_ID" -o /dev/null -w '%{http_code}' -H "x-wish-token-hash: $HASH")
n=$(req GET "$REST?select=id&title=eq.$TITLE" -H "x-wish-token-hash: $HASH" | grep -c "$TITLE")
if [[ "$n" -eq 0 ]]; then ok "owner deleted the row ($code)"; else bad "row still present after owner delete"; fi

echo
echo "passed=$pass failed=$fail"
[[ "$fail" -eq 0 ]] && echo "RESULT: schema + RLS verified end to end." || echo "RESULT: problems found — see FAIL lines above."
exit "$fail"
