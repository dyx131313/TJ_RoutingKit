#!/bin/bash
# Simple test script to call /route with an explicit time (epoch seconds)
set -euo pipefail
if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <from_lat,from_lon> <to_lat,to_lon> <epoch_time>"
  exit 1
fi
FROM=$1
TO=$2
TIME=$3
RESP=$(curl -sS "http://127.0.0.1:3000/route?from=${FROM}&to=${TO}&time=${TIME}" || true)
if command -v jq >/dev/null 2>&1; then
  echo "$RESP" | jq .
elif python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2, ensure_ascii=False))" 2>/dev/null <<<"$RESP"; then
  true
else
  echo "$RESP"
fi
