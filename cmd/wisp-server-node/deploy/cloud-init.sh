#!/usr/bin/env bash
#
# cloud-init for a geo-distributed Wisp node on DigitalOcean.
#
# Philosophy: immutable substrate. Nothing about this script is idempotent
# on a running box — if you want to change something, destroy the droplet
# and recreate it. The only things that change after bootstrap are:
#
#   1. App code, via cron pulling maceip/v9 main and restarting systemd
#   2. OS kernel, via weekly reboot cron (no package upgrades otherwise)
#
# No SSH, no remote login, no mutable config. Emergency access is the DO
# web console only.
#
# Placeholders replaced at droplet-create time by deploy.py:
#   __FQDN__  — this node's public hostname (e.g. fra.edge.stare.network)
#
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ─── Lock the box down BEFORE installing anything ──────────────────────
systemctl disable --now ssh || true
systemctl mask ssh || true
# Keep UFW open only for ACME + wss. Nothing else is ever reachable.
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 80/tcp   comment 'ACME HTTP-01'
ufw allow 443/tcp  comment 'Wisp wss'
ufw --force enable

# ─── Base packages ─────────────────────────────────────────────────────
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git nodejs npm caddy

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
# Security sandboxing — what root does on this box is very narrow
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

# ─── Caddy reverse-proxy with automatic HTTPS ─────────────────────────
# Caddy will attempt Let's Encrypt HTTP-01 validation. Until DNS for
# __FQDN__ points at this droplet, validation will fail and Caddy will
# retry with exponential backoff. Once DNS is live, the next retry
# succeeds and a cert is issued without any action on the box.
cat > /etc/caddy/Caddyfile <<CADDY
{
    email ops@stare.network
    # Shorter retry window while waiting for DNS to propagate
    storage file_system /var/lib/caddy
}

__FQDN__ {
    reverse_proxy localhost:8080 {
        # WebSocket passthrough
        header_up Host {host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
    encode gzip
    header {
        Strict-Transport-Security "max-age=31536000"
    }
}
CADDY

systemctl enable --now caddy

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

# ─── Weekly kernel-reboot cron (applies pending kernel updates) ───────
cat > /etc/cron.d/v9-weekly-reboot <<'CRON'
0 4 * * 0 root /sbin/shutdown -r now "weekly kernel reboot"
CRON

# ─── Unattended security upgrades ─────────────────────────────────────
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

# ─── Bootstrap done marker ────────────────────────────────────────────
install -d /var/lib/v9
echo "$(date -Is) bootstrap complete on __FQDN__" > /var/lib/v9/bootstrap-complete
