#!/usr/bin/env bash
# Synchronizace proměnných z prostředí (např. GitHub Actions secrets) do Vercel projektu.
# Spouštěj z kořene repozitáře: bash .github/scripts/sync-vercel-env.sh
# Vyžaduje: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID a proměnné pojmenované jako v seznamu níže.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB="$ROOT/apps/web"

if [[ ! -d "$WEB" ]]; then
  echo "Chybí adresář apps/web" >&2
  exit 1
fi

for v in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
  if [[ -z "${!v:-}" ]]; then
    echo "Chybí povinná proměnná: $v" >&2
    exit 1
  fi
done

mkdir -p "$WEB/.vercel"
printf '{"projectId":"%s","orgId":"%s"}\n' "$VERCEL_PROJECT_ID" "$VERCEL_ORG_ID" >"$WEB/.vercel/project.json"

export VERCEL_TOKEN

vercel_cli() {
  npx --yes vercel@39 "$@"
}

NAMES=(
  DATABASE_URL
  AUTH_SECRET
  NEXTAUTH_SECRET
  AUTH_URL
  NEXTAUTH_URL
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  ALLOWED_EMAIL_DOMAIN
  GMAIL_CLIENT_ID
  GMAIL_CLIENT_SECRET
  GMAIL_REFRESH_TOKEN
  GMAIL_FILTER_LABEL
  GMAIL_PROCESSED_LABEL
  GMAIL_POLL_MAX_RESULTS
  GMAIL_ONLY_UNREAD
  GMAIL_DELIVERED_TO
  GMAIL_ADDRESS_MATCH_MODE
  CRON_SECRET
  INVOICE_DB_RETENTION_DAYS
  INVOICE_TMP_DIR
  GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
  GOOGLE_DRIVE_INVOICES_FOLDER_ID
  GOOGLE_DRIVE_RECEIPTS_FOLDER_ID
  ANTHROPIC_API_KEY
  ANTHROPIC_MODEL
  AI_CONFIDENCE_THRESHOLD
  AI_BATCH_LIMIT
  PIPEDRIVE_API_TOKEN
  PIPEDRIVE_DOMAIN
  PIPEDRIVE_CATEGORY_FIELD_KEY
  OPS_ADMIN_CONTACT
)

TARGETS=(production preview)

sync_one() {
  local name="$1"
  local val
  val="${!name:-}"
  if [[ -z "$val" ]]; then
    echo "::notice::Přeskakuji prázdné: $name"
    return 0
  fi
  local target
  for target in "${TARGETS[@]}"; do
    if printf '%s' "$val" | vercel_cli env add "$name" "$target" --force; then
      echo "OK $name → $target"
    elif printf '%s' "$val" | vercel_cli env update "$name" "$target" --yes; then
      echo "OK (update) $name → $target"
    else
      echo "::warning::Nepodařilo se nastavit $name ($target)."
    fi
  done
}

cd "$WEB"

for name in "${NAMES[@]}"; do
  sync_one "$name"
done

echo "Hotovo."
