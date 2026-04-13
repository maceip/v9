#!/usr/bin/env bash
#
# cloud-init for a DO droplet backing the Wisp Global Load Balancer.
#
# Philosophy: immutable substrate. The droplet is a target behind a DO
# Global LB — TLS termination, custom domain, and CDN caching all live
# on the LB. The droplet just runs Node on :8080 and is firewalled so
# only DO load balancers can reach it.
#
# The only mutations after bootstrap are:
#   1. App code, via cron pulling maceip/v9 main every 5 min
#   2. OS kernel, via weekly reboot cron
#
# No SSH, no remote login, no mutable config. Emergency access = DO
# web console only. To change anything else: destroy + recreate.
#
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ─── Lock the box down ─────────────────────────────────────────────────
systemctl disable --now ssh || true
systemctl mask ssh || true
# UFW as a last-line defense. The DO Cloud Firewall does the real
# filtering (only "load_balancer" source is allowed on :8080), but UFW
# on the box closes everything just in case the cloud firewall ever
# misconfigures.
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 8080/tcp comment 'Wisp http (LB source only via cloud firewall)'
ufw --force enable

# ─── Base packages ─────────────────────────────────────────────────────
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git nodejs npm unattended-upgrades

# ─── Clone the v9 repo (public, read-only) ────────────────────────────
install -d -o root -g root /opt/v9
git clone --depth=1 https://github.com/maceip/v9.git /opt/v9

# ─── Install Wisp runtime deps ────────────────────────────────────────
cd /opt/v9/cmd/wisp-server-node
npm install --omit=dev --no-audit --no-fund

# ─── systemd unit for the Wisp server ─────────────────────────────────
cat > /etc/systemd/system/wisp.service <<'UNIT'
[Unit]
Description=v9 Wisp server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/v9/cmd/wisp-server-node
ExecStart=/usr/bin/node server.js
Environment=PORT=8080
Environment=NODE_ENV=production
Environment=WISP_ORIGIN_ALLOWLIST=https://maceip.github.io
Environment=WISP_MAX_SESSIONS_PER_IP=10
Environment=WISP_BANDWIDTH_BPS=10485760
Environment=WISP_STREAM_IDLE_MS=60000
Environment=WISP_STREAM_MAX_LIFETIME_MS=1800000
Restart=always
RestartSec=3
# Sandboxing
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/v9
ProtectHome=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now wisp.service

# ─── Self-update cron: pull maceip/v9 main every 5 min ────────────────
cat > /usr/local/bin/v9-selfupdate.sh <<'UPDATE'
#!/usr/bin/env bash
set -e
cd /opt/v9
BEFORE=$(git rev-parse HEAD)
git fetch --quiet origin main
git reset --hard --quiet origin/main
AFTER=$(git rev-parse HEAD)
if [ "$BEFORE" != "$AFTER" ]; then
  cd cmd/wisp-server-node
  npm install --omit=dev --no-audit --no-fund --silent
  systemctl restart wisp.service
  logger -t v9-selfupdate "updated $BEFORE -> $AFTER, wisp restarted"
fi
UPDATE
chmod 755 /usr/local/bin/v9-selfupdate.sh

cat > /etc/cron.d/v9-selfupdate <<'CRON'
*/5 * * * * root /usr/local/bin/v9-selfupdate.sh >/dev/null 2>&1
CRON

# ─── Weekly kernel-reboot cron ────────────────────────────────────────
cat > /etc/cron.d/v9-weekly-reboot <<'CRON'
0 4 * * 0 root /sbin/shutdown -r now "weekly kernel reboot"
CRON

# ─── Unattended security upgrades ─────────────────────────────────────
dpkg-reconfigure -f noninteractive unattended-upgrades

install -d /var/lib/v9
echo "$(date -Is) bootstrap complete" > /var/lib/v9/bootstrap-complete
