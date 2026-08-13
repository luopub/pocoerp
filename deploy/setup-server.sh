#!/bin/bash
# PocoERP 服务器首次部署脚本（Ubuntu 22.04，在服务器上以普通用户执行）
# 前提：已安装 git、mongodump；sudo 密码用于安装 nginx 与 pm2 开机自启
# 用法：SUDO_PASS=xxx ./setup-server.sh
set -e

APP_DIR="$HOME/pocoerp"
NODE_DIR="$HOME/apps/node20"
REPO="https://gitee.com/luopub/pocoerp.git"

echo "== 1/8 安装 Node 20（用户目录，免 apt） =="
if [ ! -x "$NODE_DIR/bin/node" ]; then
  mkdir -p "$HOME/apps"
  cd "$HOME/apps"
  curl -fL -o node20.tar.xz https://registry.npmmirror.com/-/binary/node/v20.18.1/node-v20.18.1-linux-x64.tar.xz
  tar -xf node20.tar.xz && mv node-v20.18.1-linux-x64 node20 && rm node20.tar.xz
fi
export PATH="$NODE_DIR/bin:$PATH"
node -v

echo "== 2/8 拉取代码 =="
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO" "$APP_DIR"
else
  cd "$APP_DIR" && git pull --ff-only
fi
cd "$APP_DIR"
mkdir -p logs uploads

echo "== 3/8 写入 server/.env（若不存在） =="
if [ ! -f server/.env ]; then
  JWT=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  cat > server/.env <<EOF
MONGODB_HOST=127.0.0.1
MONGODB_PORT=27017
MONGODB_DBNAME=crawler
MONGODB_USERNAME=${MONGODB_USERNAME:?请通过环境变量传入 Mongo 用户名}
MONGODB_PASSWORD=${MONGODB_PASSWORD:?请通过环境变量传入 Mongo 密码}
APP_DB_NAME=pocoerp
PORT=3100
JWT_SECRET=$JWT
EOF
  chmod 600 server/.env
  echo "已生成 server/.env（含随机 JWT_SECRET）"
else
  echo "server/.env 已存在，跳过"
fi

echo "== 4/8 安装后端依赖 =="
cd "$APP_DIR/server" && npm ci --omit=dev

echo "== 5/8 构建前端 =="
cd "$APP_DIR/web" && npm ci && npm run build

echo "== 6/8 安装并启动 PM2 =="
npm install -g pm2
cd "$APP_DIR"
pm2 start ecosystem.config.js
pm2 save
# 开机自启（pm2 输出 sudo 命令，这里自动执行）
if [ -n "$SUDO_PASS" ]; then
  echo "$SUDO_PASS" | sudo -S env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" || true
fi

echo "== 7/8 配置 Nginx =="
if [ -n "$SUDO_PASS" ]; then
  echo "$SUDO_PASS" | sudo -S apt-get install -y nginx
  echo "$SUDO_PASS" | sudo -S cp deploy/nginx-pocoerp.conf /etc/nginx/sites-available/pocoerp
  echo "$SUDO_PASS" | sudo -S ln -sf /etc/nginx/sites-available/pocoerp /etc/nginx/sites-enabled/pocoerp
  echo "$SUDO_PASS" | sudo -S rm -f /etc/nginx/sites-enabled/default
  echo "$SUDO_PASS" | sudo -S nginx -t
  echo "$SUDO_PASS" | sudo -S systemctl enable --now nginx
  echo "$SUDO_PASS" | sudo -S systemctl reload nginx
else
  echo "未提供 SUDO_PASS，跳过 nginx 安装（请手动执行 deploy/nginx-pocoerp.conf 的配置）"
fi

echo "== 8/8 配置每日备份 =="
chmod +x deploy/backup.sh deploy/deploy.sh
( crontab -l 2>/dev/null | grep -v 'pocoerp/deploy/backup.sh' ; \
  echo "30 3 * * * $APP_DIR/deploy/backup.sh >> $HOME/backups/pocoerp.log 2>&1" ) | crontab -
mkdir -p "$HOME/backups"
crontab -l | grep backup

echo "== 部署完成 =="
curl -s http://127.0.0.1:3000/api/health && echo
