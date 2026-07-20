#!/bin/bash
set -e

echo "=== 1. Securing PostgreSQL ==="

PG_CONF=$(find /etc/postgresql -name postgresql.conf 2>/dev/null | head -1)
echo "Config: $PG_CONF"

# Change listen_addresses from '*' to 'localhost'
sed -i "s/listen_addresses = '\*'/listen_addresses = 'localhost'/" "$PG_CONF"
echo "listen_addresses updated:"
grep listen_addresses "$PG_CONF"

echo ""
echo "=== 2. Restricting pg_hba.conf ==="

PG_HBA=$(find /etc/postgresql -name pg_hba.conf 2>/dev/null | head -1)
echo "HBA: $PG_HBA"

# Remove any lines allowing remote access (0.0.0.0 or ::/0)
sed -i '/^host.*0\.0\.0\.0/d' "$PG_HBA"
sed -i '/^host.*::0/d' "$PG_HBA"
sed -i '/^hostssl.*0\.0\.0\.0/d' "$PG_HBA"
sed -i '/^hostssl.*::0/d' "$PG_HBA"
# Also remove any broad 'host all all' with md5/scram
sed -i '/^host[[:space:]]\+all[[:space:]]\+all[[:space:]]\+0\.0\.0\.0\/0/d' "$PG_HBA"
sed -i '/^host[[:space:]]\+all[[:space:]]\+all[[:space:]]\+::\/0/d' "$PG_HBA"
echo "Removed remote access rules"

echo ""
echo "=== 3. Restarting PostgreSQL ==="
systemctl restart postgresql
echo "PostgreSQL restarted"

echo ""
echo "=== 4. Verifying port binding ==="
ss -tlnp | grep 5432 || echo "Port 5432 not found (PostgreSQL may not be running)"

echo ""
echo "=== 5. Installing and configuring UFW firewall ==="
apt-get install -y ufw > /dev/null 2>&1 || true
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
echo ""
echo "=== UFW status ==="
ufw status verbose

echo ""
echo "=== 6. Remaining PG databases ==="
sudo -u postgres psql -c '\l'

echo ""
echo "=== DONE ==="
