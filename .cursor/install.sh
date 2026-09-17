#!/usr/bin/env bash
# Cloud Agent install: idempotent bootstrap for the vividbooks-ops monorepo.
# Prepares system packages, a local PostgreSQL (port 5433) with the migrated
# schema for apps/web (Next.js), and the Python venv for the Streamlit hub.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export DEBIAN_FRONTEND=noninteractive

echo "==> [1/6] System packages (PostgreSQL, python venv)"
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql postgresql-contrib python3-venv

PG_VERSION="$(ls /etc/postgresql | sort -V | tail -1)"
PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"

echo "==> [2/6] Configure PostgreSQL on port 5433 and start it"
sudo sed -i 's/^#\?port = .*/port = 5433/' "$PG_CONF"
sudo pg_ctlcluster "$PG_VERSION" main start 2>/dev/null \
  || sudo pg_ctlcluster "$PG_VERSION" main restart 2>/dev/null \
  || true
for _ in $(seq 1 30); do
  sudo -u postgres pg_isready -p 5433 -q && break || sleep 1
done

echo "==> [3/6] Ensure Supabase-compatible roles + local database"
# Production runs on Supabase, whose RLS migrations reference the "anon" and
# "authenticated" roles. Create them locally so `prisma migrate deploy` applies.
sudo -u postgres psql -p 5433 -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
ALTER USER postgres WITH PASSWORD 'postgres';
SELECT 'CREATE DATABASE invoices' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='invoices')\gexec
SQL

echo "==> [4/6] apps/web: .env"
cd "$REPO_ROOT/apps/web"
if [ ! -f .env ]; then
  cp .env.example .env
fi
# Give local dev a real AUTH_SECRET (keeps the example placeholder out of runtime).
if grep -q 'AUTH_SECRET="vygeneruj-nahodny-retezec-min-32-znaku"' .env; then
  SECRET="$(openssl rand -hex 32)"
  sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=\"${SECRET}\"|" .env
fi

echo "==> [5/6] apps/web: install deps + native binaries + migrate"
npm ci
# The committed package-lock.json was generated on a non-Linux platform, so npm
# skips the linux-x64 native binaries for lightningcss / @tailwindcss/oxide
# (Tailwind v4). Install the matching versions without touching the lockfile.
LCSS="$(node -p "require('./node_modules/lightningcss/package.json').version")"
OXIDE="$(node -p "require('./node_modules/@tailwindcss/oxide/package.json').version")"
npm install --no-save "lightningcss-linux-x64-gnu@${LCSS}" "@tailwindcss/oxide-linux-x64-gnu@${OXIDE}"
npx prisma migrate deploy

echo "==> [6/6] Streamlit hub: Python venv"
cd "$REPO_ROOT"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt

echo "==> Install complete."
