#!/usr/bin/env bash
set -euo pipefail

# Deploy script — called by GitHub Actions via SSH
# Pulls latest code, installs deps, builds, restarts service

APP_DIR="/opt/late-service"

cd "$APP_DIR"

echo "==> Pulling latest code..."
git fetch origin master
git reset --hard origin/master

echo "==> Installing dependencies..."
npm install

echo "==> Building..."
npm run build

echo "==> Pruning dev dependencies..."
npm prune --omit=dev

echo "==> Restarting service..."
sudo systemctl restart late-service

echo "==> Checking status..."
sleep 2
if systemctl is-active --quiet late-service; then
  echo "Deploy successful — late-service is running"
else
  echo "ERROR: late-service failed to start"
  sudo journalctl -u late-service --no-pager -n 20
  exit 1
fi
