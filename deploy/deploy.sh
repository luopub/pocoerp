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

echo "== health check =="
# reload 后服务需要几秒完成启动与数据库连接，轮询等待而不是立即检查
ok=0
for i in $(seq 1 15); do
  if curl -sf -m 2 http://127.0.0.1:3100/api/health > /dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" = "1" ]; then
  curl -s http://127.0.0.1:3100/api/health && echo
  echo "== done =="
else
  echo "!! 健康检查失败，请执行 pm2 logs pocoerp 查看日志"
  exit 1
fi
