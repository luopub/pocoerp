#!/bin/bash
# PocoERP 服务器端更新脚本：拉代码 → 装依赖 → 构建前端 → 重启服务
# 在服务器上执行：~/pocoerp/deploy/deploy.sh
set -e
cd "$(dirname "$0")/.."

export PATH="$HOME/apps/node20/bin:$PATH"

echo "== git pull =="
git pull --ff-only

echo "== server deps =="
cd server && npm ci --omit=dev && cd ..

echo "== web build =="
cd web && npm ci && npm run build && cd ..

echo "== pm2 reload =="
pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js
pm2 save

echo "== done =="
curl -s http://127.0.0.1:3000/api/health && echo
