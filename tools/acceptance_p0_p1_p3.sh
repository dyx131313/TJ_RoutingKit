#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
FROM="${FROM:-31.2225,121.417}"
TO="${TO:-31.2133,121.485}"
RULE_ID="${RULE_ID:-mmlewx2c5tg}"
PLATE_HIT="${PLATE_HIT:-A12345}"
PLATE_MISS="${PLATE_MISS:-A12346}"
QUERY_DATE="${QUERY_DATE:-2026-03-11T08:30:00}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[FAIL] missing command: $1" >&2
    exit 1
  }
}

need_cmd curl
need_cmd python3

echo "[1/6] flush route cache"
flush_resp="$(curl -fsS -X POST "$BASE_URL/api/cache/flush")"
python3 - <<'PY' "$flush_resp"
import json, sys
obj = json.loads(sys.argv[1])
assert obj.get('ok') is True, f"unexpected flush resp: {obj}"
print('[PASS] cache flush ok')
PY

echo "[2/6] profile routing: normal/walking/bus"
for profile in normal walking bus; do
  body="$(curl -fsS "$BASE_URL/route?from=$FROM&to=$TO&profile=$profile")"
  python3 - <<'PY' "$profile" "$body"
import json, sys
profile = sys.argv[1]
obj = json.loads(sys.argv[2])
assert 'error' not in obj, f"{profile} route error: {obj}"
path = obj.get('path_coordinates') if isinstance(obj.get('path_coordinates'), list) else obj.get('path')
assert isinstance(path, list) and len(path) > 1, f"{profile} invalid path"
assert isinstance(obj.get('travel_time'), int), f"{profile} missing travel_time"
ms = obj.get('metric_source', '')
if profile == 'walking':
    assert 'walking' in ms, f"walking metric source mismatch: {ms}"
if profile == 'bus':
    assert 'bus' in ms, f"bus metric source mismatch: {ms}"
print(f"[PASS] {profile} route ok | metric_source={ms} | travel_time={obj.get('travel_time')}")
PY
done

echo "[3/6] incremental update endpoint"
update_resp="$(curl -fsS -X POST "$BASE_URL/api/graph/update_weights" -H 'Content-Type: application/json' -d '{"updates":[{"arc":102,"weight":123456}]}' )"
python3 - <<'PY' "$update_resp"
import json, sys
obj = json.loads(sys.argv[1])
assert obj.get('status') == 'ok', f"update failed: {obj}"
assert isinstance(obj.get('updated_arcs'), int) and obj['updated_arcs'] >= 1, f"bad updated_arcs: {obj}"
print(f"[PASS] update_weights ok | updated_arcs={obj['updated_arcs']}")
PY

echo "[4/6] plate policy miss should fallback"
miss_body="$(curl -fsS "$BASE_URL/route?from=$FROM&to=$TO&profile=normal&rule_id=$RULE_ID&plate=$PLATE_MISS&query_date=$QUERY_DATE")"
python3 - <<'PY' "$miss_body"
import json, sys
obj = json.loads(sys.argv[1])
assert 'error' not in obj, f"route error: {obj}"
ms = obj.get('metric_source', '')
assert 'signature:' not in ms, f"plate miss should not use signature metric: {ms}"
print(f"[PASS] plate miss fallback ok | metric_source={ms}")
PY

echo "[5/6] plate policy hit should apply signature"
hit_body="$(curl -fsS "$BASE_URL/route?from=$FROM&to=$TO&profile=normal&rule_id=$RULE_ID&plate=$PLATE_HIT&query_date=$QUERY_DATE")"
python3 - <<'PY' "$hit_body"
import json, sys
obj = json.loads(sys.argv[1])
assert 'error' not in obj, f"route error: {obj}"
ms = obj.get('metric_source', '')
assert 'signature:' in ms, f"plate hit should use signature metric: {ms}"
assert isinstance(obj.get('base_travel_time'), int), f"missing base_travel_time: {obj}"
assert isinstance(obj.get('metric_travel_time'), int), f"missing metric_travel_time: {obj}"
print(f"[PASS] plate hit rule metric ok | metric_source={ms}")
PY

echo "[6/6] quick cache smoke (two identical requests)"
python3 - <<'PY' "$BASE_URL" "$FROM" "$TO"
import json, sys, time, urllib.request
base, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
url = f"{base}/route?from={src}&to={dst}&profile=normal"
def req():
    t0 = time.time()
    with urllib.request.urlopen(url, timeout=8) as f:
        obj = json.loads(f.read().decode('utf-8'))
    dt = (time.time() - t0) * 1000
    return obj, dt
obj1, t1 = req()
obj2, t2 = req()
assert 'error' not in obj1 and 'error' not in obj2, 'cache smoke route failed'
print(f"[PASS] cache smoke ok | first_ms={t1:.1f} second_ms={t2:.1f}")
PY

echo "All acceptance checks passed."
