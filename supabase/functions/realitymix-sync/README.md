# Edge Function: `realitymix-sync`

Volá [egress-realitymix](../../../apps/egress-realitymix) workera s pevnou veřejnou
IPv4 a stahuje statistiky a poptávky z RealityMIX XML-RPC API. Výsledek
upsertuje do tabulek `realitymix_listing_stats` a `realitymix_inquiries`
(migrace [20260522130000_realitymix_tables.sql](../../migrations/20260522130000_realitymix_tables.sql)).

## Volání

```bash
curl -X POST "$SUPABASE_FUNCTIONS_URL/realitymix-sync" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind": "all"}'
```

Body parametry:

| Pole | Typ | Popis |
| ---- | --- | ----- |
| `kind` | `"stats" \| "inquiries" \| "all"` | Co synchronizovat. Default `"all"`. |
| `since` | ISO timestamp | Filtruje poptávky od daného času. |
| `dateFrom` / `dateTo` | `YYYY-MM-DD` | Filtruje statistiky podle data. |
| `advertIds` | `string[]` | Omezí statistiky na konkrétní inzeráty. |
| `detail` | `boolean` | Pokud `true`, použije `listFullInquiry` (vrací zprávu). |

## Vyžadované secrets

- `SUPABASE_URL` — auto-injected.
- `SUPABASE_SERVICE_ROLE_KEY` — auto-injected.
- `EGRESS_BASE_URL` — např. `https://vividbooks-egress-realitymix.fly.dev`.
- `INTERNAL_EGRESS_TOKEN` — sdílené tajemství s workerem.

```bash
supabase secrets set \
  EGRESS_BASE_URL=https://vividbooks-egress-realitymix.fly.dev \
  INTERNAL_EGRESS_TOKEN="$(openssl rand -base64 48)"
```

## Lokální vývoj

V kořeni repa:

```bash
supabase functions serve realitymix-sync \
  --env-file supabase/functions/realitymix-sync/.env.local
```

Soubor `.env.local` (nikdy do gitu):

```
EGRESS_BASE_URL=http://host.docker.internal:8080
INTERNAL_EGRESS_TOKEN=dev-token-please-rotate
```

Worker spustit přes `docker compose -f apps/egress-realitymix/docker-compose.yml up`
s `MOCK_MODE=true`, ať Edge Function dostává fixturu místo skutečných dat z RealityMIX.

## Cron / scheduler

V Supabase dashboardu (Database → Cron) nebo přes `pg_cron`:

```sql
-- Statistiky 1× denně po půlnoci.
select cron.schedule(
    'realitymix-sync-stats',
    '10 0 * * *',
    $$select net.http_post(
        url := 'https://<project>.functions.supabase.co/realitymix-sync',
        headers := jsonb_build_object(
            'content-type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.functions_token')
        ),
        body := '{"kind":"stats"}'
    );$$
);

-- Poptávky každých 15 minut s rolujícím oknem 24 h.
select cron.schedule(
    'realitymix-sync-inquiries',
    '*/15 * * * *',
    $$select net.http_post(
        url := 'https://<project>.functions.supabase.co/realitymix-sync',
        headers := jsonb_build_object(
            'content-type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.functions_token')
        ),
        body := jsonb_build_object(
            'kind', 'inquiries',
            'detail', true,
            'since', (now() - interval '24 hours')::text
        )::text
    );$$
);
```
