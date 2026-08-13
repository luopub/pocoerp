#!/bin/bash
# PocoERP MongoDB 每日备份脚本
# 用法：加入 crontab，如 每天 03:30 执行：
#   30 3 * * * /home/dell/pocoerp/deploy/backup.sh >> /home/dell/backups/pocoerp.log 2>&1
set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_ROOT="$HOME/backups/pocoerp"
KEEP_DAYS=14

# 从 server/.env 读取连接参数（不硬编码敏感信息）
set -a
. "$APP_DIR/server/.env"
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"

mongodump \
  --host "$MONGODB_HOST" --port "$MONGODB_PORT" \
  --username "$MONGODB_USERNAME" --password "$MONGODB_PASSWORD" \
  --authenticationDatabase "$MONGODB_DBNAME" \
  --db "${APP_DB_NAME:-pocoerp}" \
  --out "$DEST"

# 只保留最近 KEEP_DAYS 天的备份
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -rf {} +

echo "[backup] $STAMP done -> $DEST"
