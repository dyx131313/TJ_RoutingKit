#!/usr/bin/env bash
# run.sh - 一键启动脚本：先启动 C++ routing_server，再启动 Node.js 服务
set -e
ROOT_DIR=$(cd "$(dirname "$0")" && pwd)

# 启动 C++ 路由服务（在后台）
cd "$ROOT_DIR/app_backend"
if [ -x ./routing_server ]; then
  echo "Starting C++ routing_server..."
  ./routing_server --pbf ../data/shanghai-250916.osm.pbf &
  sleep 1
else
  echo "routing_server binary not found or not executable. Please run 'make' in app_backend first."
fi

# 启动 Node.js 服务
cd "$ROOT_DIR/app_node"
if [ -f package.json ]; then
  echo "Starting Node.js service..."
  npm install --no-audit --no-fund
  npm run start &
else
  echo "package.json not found in app_node."
fi

echo "All services started. Visit http://localhost:3000/index.html"
