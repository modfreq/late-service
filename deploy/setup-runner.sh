#!/usr/bin/env bash
set -euo pipefail

# Sets up a GitHub Actions self-hosted runner on this machine.
# Run as root AFTER setup-lxc.sh has completed.
#
# Before running, get a runner token from:
#   GitHub repo → Settings → Actions → Runners → New self-hosted runner
#
# Usage: bash setup-runner.sh <RUNNER_TOKEN>

RUNNER_TOKEN="${1:?Usage: setup-runner.sh <RUNNER_TOKEN>}"
RUNNER_DIR="/opt/github-runner"
RUNNER_USER="late"
RUNNER_VERSION="2.322.0"

echo "==> Creating runner directory..."
mkdir -p "$RUNNER_DIR"

echo "==> Downloading GitHub Actions runner..."
cd "$RUNNER_DIR"
curl -fsSL -o actions-runner.tar.gz \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"

echo "==> Extracting..."
tar xzf actions-runner.tar.gz
rm actions-runner.tar.gz

echo "==> Installing dependencies..."
./bin/installdependencies.sh

echo "==> Setting ownership..."
chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"

echo ""
echo "============================================"
echo "  Runner downloaded — now configure it"
echo "============================================"
echo ""
echo "Run the following commands:"
echo ""
echo "  su -s /bin/bash $RUNNER_USER"
echo "  cd $RUNNER_DIR"
echo "  ./config.sh --url https://github.com/OWNER/late-service --token $RUNNER_TOKEN"
echo ""
echo "When prompted:"
echo "  - Runner group: press Enter (default)"
echo "  - Runner name:  late-service-lxc"
echo "  - Labels:       press Enter (default includes self-hosted,linux,x64)"
echo "  - Work folder:  press Enter (default _work)"
echo ""
echo "After config, exit back to root and install as a service:"
echo ""
echo "  exit"
echo "  cd $RUNNER_DIR"
echo "  ./svc.sh install $RUNNER_USER"
echo "  ./svc.sh start"
echo "  ./svc.sh status"
echo ""
echo "The runner will now auto-start on boot and pick up GitHub Actions jobs."
echo ""
