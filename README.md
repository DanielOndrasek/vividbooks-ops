# Vividbooks Ops

Monorepo pro interní nástroje. Webová aplikace pro zpracování dokladů z Gmailu žije v [`apps/web`](apps/web).

## Rychlý start (web)

```bash
cd apps/web
cp .env.example .env
# nastavte DATABASE_URL, AUTH_SECRET, Google OAuth, Gmail, Drive — viz apps/web/.env.example
npm install
npx prisma migrate deploy
npm run dev
```

Z kořene repozitáře lze použít zkratky: `npm run dev`, `npm run build` (delegují do `apps/web`).

Podrobnosti nasazení a GCP (Gmail API, Drive, service account) jsou v [apps/web/README.md](apps/web/README.md).
