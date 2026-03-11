#!/usr/bin/env bash
set -euo pipefail

# Run this script INSIDE the LXC container as root to set everything up.
# Usage: bash setup-lxc.sh <GITHUB_REPO_URL>
#
# Example: bash setup-lxc.sh https://github.com/youruser/late-service.git

REPO_URL="${1:?Usage: setup-lxc.sh <GITHUB_REPO_URL>}"
APP_DIR="/opt/late-service"
NODE_MAJOR=22

echo "==> Updating system..."
apt-get update && apt-get upgrade -y

echo "==> Installing prerequisites..."
apt-get install -y curl git build-essential sudo

echo "==> Installing Node.js ${NODE_MAJOR}..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
apt-get install -y nodejs

echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

echo "==> Creating service user..."
useradd --system --shell /bin/bash --home-dir "$APP_DIR" --create-home late || true

if [ "$REPO_URL" = "skip-clone" ]; then
  echo "==> Skipping clone (repo already at $APP_DIR)"
elif [ -d "$APP_DIR/.git" ]; then
  echo "==> Repo already cloned at $APP_DIR, pulling latest..."
  cd "$APP_DIR" && git pull
else
  echo "==> Cloning repository..."
  git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> Setting up data directory..."
mkdir -p "$APP_DIR/data"

echo "==> Installing dependencies..."
cd "$APP_DIR"
npm ci --omit=dev

echo "==> Building..."
npm run build

echo "==> Setting ownership..."
chown -R late:late "$APP_DIR"

echo "==> Installing systemd service..."
cp "$APP_DIR/deploy/late-service.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable late-service

echo "==> Creating sudoers entry for deploy user..."
cat > /etc/sudoers.d/late-deploy << 'SUDOERS'
late ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart late-service, /usr/bin/systemctl status late-service, /usr/bin/journalctl -u late-service *
SUDOERS
chmod 440 /etc/sudoers.d/late-deploy

echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Create .env file:  nano $APP_DIR/.env"
echo "  2. Create config:     mkdir -p $APP_DIR/config && nano $APP_DIR/config/projects.yaml"
echo "  3. Set ownership:     chown late:late $APP_DIR/.env $APP_DIR/config/projects.yaml"
echo "  4. Start service:     systemctl start late-service"
echo "  5. Check logs:        journalctl -u late-service -f"
echo ""
echo "Then set up the GitHub Actions runner:"
echo "  bash $APP_DIR/deploy/setup-runner.sh"
echo ""
