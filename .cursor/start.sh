#!/usr/bin/env bash
# Cloud Agent start: per-boot reconciliation. Ensures PostgreSQL is running so
# the dev servers (started in terminals) can reach the database.
set -euo pipefail

PG_VERSION="$(ls /etc/postgresql | sort -V | tail -1)"

sudo pg_ctlcluster "$PG_VERSION" main start 2>/dev/null || true
for _ in $(seq 1 30); do
  sudo -u postgres pg_isready -p 5433 -q && break || sleep 1
done

sudo -u postgres pg_isready -p 5433 || {
  echo "PostgreSQL did not become ready on port 5433" >&2
  exit 1
}
echo "PostgreSQL is ready on port 5433."
