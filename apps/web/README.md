# Web — zpracování dokladů z Gmailu

Next.js aplikace: stahování příloh, klasifikace a extrakce (Claude), schvalování faktur, okamžité ukládání dokladů o platbě na **Google Drive** (Shared Drive).

Součástí jsou i další provozní moduly: **Provize** (Pipedrive), **Sales controlling** a **Skladové zásoby** (`/inventory`) — evidence skladových položek, stav zásob a pohyby (příjem / výdej / korekce) s hlídáním minim. Stav zásob lze synchronizovat z **Fulfillment.cz** (tlačítko *Aktualizovat* nebo hodinová automatická aktualizace); stačí nastavit `FULFILLMENT_API_TOKEN`. Hodinové spouštění zajišťuje GitHub Actions workflow `Sync inventory (hourly)` (`.github/workflows/sync-inventory.yml`), který volá `GET /api/jobs/sync-inventory` (`Authorization: Bearer CRON_SECRET`) — Vercel Hobby plán hodinové crony neumožňuje.

## Požadavky

- Node.js 20+
- PostgreSQL 16+ (viz `docker-compose.yml`)

## Nastavení

```bash
cp .env.example .env
# vyplňte DATABASE_URL, AUTH_SECRET, Google OAuth, Gmail, Drive, Anthropic
npm install
npx prisma migrate deploy
npm run dev
```

Z monorepo kořene repozitáře: `npm run dev` (spustí tento workspace).

## Google Cloud Console (shrnutí)

1. Projekt → povolit **Gmail API** a **Google Drive API**.
2. **OAuth consent** + OAuth client (Web) pro NextAuth (`GOOGLE_CLIENT_ID` / `SECRET`).
3. Pro Gmail použijte stejný nebo samostatný OAuth client a vygenerujte refresh token: `npm run gmail:token`.
4. **Service account** → vytvořit klíč JSON → stáhnout → vložit do `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`.
5. Ve **Shared Drive** přidejte service account e-mail jako člena s oprávněním upravovat soubory.
6. Vytvořte dvě složky na disku (např. „Faktury“ / „Přijaté platby“), zkopírujte jejich **folder ID** z URL do env.

## Role uživatelů

`ADMIN`, `APPROVER`, `VIEWER` — nastavte v tabulce `User` (sloupec `role`) po prvním přihlášení.

## Cron

V `vercel.json` jsou naplánované denní `GET` joby s hlavičkou `Authorization: Bearer CRON_SECRET` (poll-email, process-documents, prune-invoices-db). Hodinová aktualizace skladu běží mimo Vercel — přes GitHub Actions workflow `Sync inventory (hourly)`, který volá stejný typ endpointu (`/api/jobs/sync-inventory`). Pro běh workflow je potřeba mít v GitHub secrets `CRON_SECRET` (volitelně `APP_URL`, jinak se použije `https://vividbooks-ops.vercel.app`).

## Migrace databáze v produkci

Při **Production** deployi na Vercelu se před sestavením Next.js spustí `prisma migrate deploy` (viz `scripts/vercel-build.mjs`). Pokud by build spadl na chybějícím sloupci (starší nasazení bez migrace), můžeš migraci spustit hned z počítače: `npm run db:migrate:prod` a `DATABASE_URL` z Vercelu (návod v `scripts/migrate-prod.mjs`).
