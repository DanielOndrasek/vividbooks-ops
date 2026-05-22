# egress-realitymix

Tenký HTTP worker s **pevnou veřejnou IPv4**, který Supabase Edge Function používá
jako proxy pro XML-RPC import API serveru [RealityMIX](https://realitymix.cz/import/documentation/xml-rpc/).
RealityMIX (DALTEN media s.r.o.) vyžaduje whitelist IP adres svázaný se softwarovým klíčem.
Supabase Edge Functions běží na sdílených AWS IP rozsazích, proto je potřeba mezikrok
s pevnou IP — tento worker.

## Architektura

```
Supabase Cron → Edge Function realitymix-sync → (HTTPS + INTERNAL_EGRESS_TOKEN)
  → egress-realitymix (pevná IPv4) → XML-RPC RealityMIX → Supabase DB
```

Worker pouze překládá JSON request na XML-RPC volání, drží session
(`getHash` + `login`) a vrací odpovědi rozparsované do JSON. Nemá vlastní DB ani
byznys logiku.

## Endpointy

Všechny chráněné endpointy vyžadují hlavičku `x-internal-token` se shodným tajemstvím.
Volitelně lze omezit caller IP přes `ALLOWED_CALLER_CIDRS` (Supabase egress ranges).

| Metoda | URL | Popis |
| ------ | --- | ----- |
| `GET`  | `/healthz` | Health-check (bez autentizace). |
| `POST` | `/realitymix/stats` | Statistiky inzerátů (`listStats`). Body: `{ advertIds?, dateFrom?, dateTo? }`. |
| `POST` | `/realitymix/inquiries` | Poptávky/reakce (`listInquiry`, nebo `listFullInquiry` při `detail: true`). |
| `POST` | `/realitymix/inquiries/:inquiryId` | Detail jedné poptávky (`getInquiry`). |

## Konfigurace

Viz [.env.example](.env.example). Povinné:

- `INTERNAL_EGRESS_TOKEN` — sdílené tajemství mezi Edge Function a workerem.
- `REALITYMIX_RK_ID`, `REALITYMIX_RK_PASSWORD`, `REALITYMIX_SW_KEY` — pokud
  `MOCK_MODE=false`.

## Lokální vývoj

```bash
cd apps/egress-realitymix
cp .env.example .env
npm install
npm run dev
```

Bez whitelistu na produkční RealityMIX nelze testovat reálná data, použij
`MOCK_MODE=true` (přidá fixtury) nebo Docker:

```bash
docker compose up --build
curl -H "x-internal-token: dev-token-please-rotate" \
  -X POST http://127.0.0.1:8080/realitymix/stats -d '{}'
```

## Nasazení na Fly.io

```bash
fly launch --no-deploy --copy-config --name vividbooks-egress-realitymix --region fra
fly ips allocate-v4      # generuje dedikovanou veřejnou IPv4 (placený doplněk ~2 USD/měsíc)
fly secrets set \
  INTERNAL_EGRESS_TOKEN="$(openssl rand -base64 48)" \
  REALITYMIX_RK_ID=... \
  REALITYMIX_RK_PASSWORD=... \
  REALITYMIX_SW_KEY=...
fly deploy
fly ips list             # IP nahlásit DALTEN media (helpdesk@realitymix.cz)
```

Po deployi:

1. `fly ips list` → IPv4 zapsat do `docs/github-secrets.md` jako záznam pro runbook.
2. Stejný `INTERNAL_EGRESS_TOKEN` nastavit i v Supabase: `supabase secrets set ...`.
3. `EGRESS_BASE_URL` v Supabase = `https://vividbooks-egress-realitymix.fly.dev`
   (nebo vlastní doména).
