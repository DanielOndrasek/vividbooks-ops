# Web — zpracování dokladů z Gmailu

Next.js aplikace: stahování příloh, klasifikace a extrakce (Claude), schvalování faktur, okamžité ukládání dokladů o platbě na **Google Drive** (Shared Drive).

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

## Cron (Vercel)

V `vercel.json` jsou naplánované `GET` joby s hlavičkou `Authorization: Bearer CRON_SECRET`.
