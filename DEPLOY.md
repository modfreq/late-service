# Late Service — Proxmox LXC Deployment Guide

## Prerequisites

- Proxmox host running and accessible at `https://your-proxmox-ip:8006`
- This repo pushed to GitHub
- Your `.env` values and `config/projects.yaml` ready to copy over

---

## 1. Create the LXC Container

In the Proxmox web UI:

### Download a container template (if you haven't already)

1. Datacenter → Storage → **local** → **CT Templates** → **Templates**
2. Download **debian-11-standard** (Debian 12 requires Proxmox 8+)

### Create the container

1. Click **Create CT** (top right)
2. Fill in:
   - **General**: ID `200` (or any free ID), hostname `late-service`, set a root password
   - **Template**: debian-11-standard
   - **Disks**: 8 GB
   - **CPU**: 1 core
   - **Memory**: 512 MB (1024 if you want headroom)
   - **Network**: Static IP on your LAN (e.g., `192.168.1.200/24`, gateway `192.168.1.1`) — static is strongly recommended
   - **DNS**: Leave defaults
3. Check **Start after created**
4. Click **Finish**

### Enable auto-start on Proxmox boot

1. Select the container → **Options** → **Start at boot** → Edit → **Yes**

### Note the container's IP

```bash
# From the container console:
ip addr show eth0
```

---

## 2. Initial Setup Inside the LXC

Open the container console in Proxmox (select container → Console), or SSH in:

```bash
ssh root@<LXC_IP>
```

### Run the setup script

```bash
# Install curl and git (needed to download and clone)
apt-get update && apt-get install -y curl git

# Download and run the setup script in one shot
curl -fsSL https://raw.githubusercontent.com/YOURUSER/late-service/main/deploy/setup-lxc.sh | bash -s https://github.com/YOURUSER/late-service.git
```

Or if the repo is **private**:

```bash
apt-get update && apt-get install -y curl git
git clone https://github.com/YOURUSER/late-service.git /opt/late-service
bash /opt/late-service/deploy/setup-lxc.sh skip-clone
```

This script will:
- Install Node.js 22, git, build tools
- Create a `late` system user
- Clone the repo to `/opt/late-service` (unless already cloned)
- Install npm dependencies and build the project
- Install and enable the systemd service
- Set up sudoers so the `late` user can restart the service

---

## 3. Configure the Service

### Create the .env file

```bash
nano /opt/late-service/.env
```

Paste your environment variables:

```
LATE_API_KEY=sk_xxx
NOTION_TOKEN=ntn_xxx
DB_PATH=./data/late-service.sqlite
DASHBOARD_PORT=3100
NOTION_POLL_INTERVAL_MINUTES=5
LOG_LEVEL=info
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
ALERT_FROM=
ALERT_TO=
```

### Create the projects config

```bash
mkdir -p /opt/late-service/config
nano /opt/late-service/config/projects.yaml
```

Paste your projects.yaml content.

### Fix ownership and start

```bash
chown -R late:late /opt/late-service/.env /opt/late-service/config
systemctl start late-service
```

### Verify it's running

```bash
systemctl status late-service
journalctl -u late-service -f
```

You should see the service start, poll Notion, and log "late-service ready". The dashboard will be available at `http://<LXC_IP>:3100`.

---

## 4. Set Up the GitHub Actions Self-Hosted Runner

The runner lives inside your LXC and polls GitHub for jobs over HTTPS. No ports need to be opened — all connections are outbound.

### Get a runner token

1. Go to your GitHub repo → **Settings** → **Actions** → **Runners**
2. Click **New self-hosted runner**
3. Copy the **token** shown on that page (starts with `A`, valid for ~1 hour)

### Run the runner setup script

```bash
# As root inside the LXC:
bash /opt/late-service/deploy/setup-runner.sh <PASTE_TOKEN_HERE>
```

### Configure the runner

```bash
su -s /bin/bash late
cd /opt/github-runner
./config.sh --url https://github.com/YOURUSER/late-service --token <TOKEN>
```

When prompted, accept all defaults (press Enter):
- Runner group: default
- Runner name: `late-service-lxc` (or press Enter for hostname)
- Labels: default (self-hosted, linux, x64)
- Work folder: default (_work)

### Install as a systemd service

```bash
# Exit back to root
exit

# Install and start the runner service
cd /opt/github-runner
./svc.sh install late
./svc.sh start
./svc.sh status
```

### Verify on GitHub

Go to **Settings → Actions → Runners** — your runner should show as **Idle** with a green dot.

---

## 5. Test the Full Pipeline

From your local machine, push a change:

```bash
git add .
git commit -m "test deploy pipeline"
git push origin main
```

Then check:

1. **GitHub → Actions tab** — you should see the deploy workflow trigger and run on your self-hosted runner
2. **Inside the LXC** — `journalctl -u late-service -f` should show the service restart with the new code

---

## What Auto-Starts After a Power Outage

Everything recovers automatically in order:

| Component | Mechanism | Configured by |
|---|---|---|
| Proxmox host | BIOS "Restore on AC power loss" | Your BIOS settings |
| LXC container | Proxmox "Start at boot" | Step 1 |
| late-service | systemd `enable` + `Restart=always` | setup-lxc.sh |
| GitHub runner | systemd service via `svc.sh install` | Step 4 |

**Important**: Make sure your Proxmox host's BIOS is set to power on automatically after power loss. This is usually under Power Management → "Restore on AC Power Loss" → **Power On**.

---

## Useful Commands

```bash
# Service management
systemctl status late-service        # check status
systemctl restart late-service       # manual restart
journalctl -u late-service -f        # follow logs
journalctl -u late-service --since "1 hour ago"  # recent logs

# Runner management
cd /opt/github-runner
./svc.sh status                      # runner status
./svc.sh stop                        # stop runner
./svc.sh start                       # start runner

# Manual deploy (same thing the GitHub Action runs)
su -s /bin/bash late
bash /opt/late-service/deploy/deploy.sh
```

---

## Troubleshooting

**Service won't start**
```bash
journalctl -u late-service --no-pager -n 50
```
Usually a missing env var or bad config file.

**Runner shows offline on GitHub**
```bash
cd /opt/github-runner
./svc.sh status
# If stopped:
./svc.sh start
```

**Deploy fails with permission errors**
```bash
chown -R late:late /opt/late-service
```

**Runner token expired**
Get a new token from GitHub → Settings → Actions → Runners → New self-hosted runner, then:
```bash
cd /opt/github-runner
./svc.sh stop
su -s /bin/bash late
./config.sh remove --token <OLD_TOKEN>
./config.sh --url https://github.com/YOURUSER/late-service --token <NEW_TOKEN>
exit
./svc.sh start
```
