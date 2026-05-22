# RealityMIX egress worker – runbook

Worker [apps/egress-realitymix](../apps/egress-realitymix) je tenká XML-RPC
proxy s pevnou veřejnou IPv4, kterou nahlašujeme DALTEN media (provozovateli
[RealityMIX](https://realitymix.cz/import/documentation/xml-rpc/)) k whitelistu
na náš softwarový klíč. Bez ní by Supabase Edge Functions volaly z dynamicky
se měnících AWS IP a RealityMIX by je odmítal.

## Architektura

```
Supabase Cron → Edge Function realitymix-sync → (HTTPS + INTERNAL_EGRESS_TOKEN)
  → egress-realitymix (Fly.io, region fra, dedicated IPv4)
  → XML-RPC https://realitymix.cz/import/rpc/
  → JSON zpět do Edge Function → Supabase DB (realitymix_*)
```

## První nasazení

1. **Fly app + IPv4**

   ```bash
   cd apps/egress-realitymix
   flyctl auth login
   flyctl launch --no-deploy --copy-config --name vividbooks-egress-realitymix --region fra
   flyctl ips allocate-v4         # placený doplněk ~2 USD/měsíc
   flyctl ips list                # výslednou IPv4 si poznamenat
   ```

2. **Secrets na Fly**

   ```bash
   flyctl secrets set \
     INTERNAL_EGRESS_TOKEN="$(openssl rand -base64 48)" \
     REALITYMIX_RK_ID="..." \
     REALITYMIX_RK_PASSWORD="..." \
     REALITYMIX_SW_KEY="..."
   ```

3. **GitHub Action token**

   ```bash
   flyctl tokens create deploy --app vividbooks-egress-realitymix
   # výsledný token uložit do GitHub repository secret FLY_API_TOKEN
   ```

4. **První deploy** – buď ručně `flyctl deploy --remote-only`, nebo přes
   GitHub Actions: *Actions → Deploy egress-realitymix → Run workflow*.

5. **Whitelist u DALTEN media** – e-mail na podporu RealityMIX
   (helpdesk@realitymix.cz / kontakt přiřazený ke smlouvě) s žádostí
   o whitelist této IPv4 pro náš `REALITYMIX_SW_KEY`. Případně lze nahlásit
   primární i záložní IP.

6. **Supabase secrets** – stejný `INTERNAL_EGRESS_TOKEN` a `EGRESS_BASE_URL`
   (`https://vividbooks-egress-realitymix.fly.dev`) nastavit i v Supabase:

   ```bash
   supabase secrets set \
     INTERNAL_EGRESS_TOKEN="..." \
     EGRESS_BASE_URL="https://vividbooks-egress-realitymix.fly.dev"
   ```

## Rutinní deploy

Push do `main` s úpravou v `apps/egress-realitymix/**` automaticky pustí workflow
[deploy-egress-realitymix.yml](../.github/workflows/deploy-egress-realitymix.yml).
Pro out-of-band deploy:

```bash
cd apps/egress-realitymix
flyctl deploy --remote-only
```

## Health-check a alerting

- `GET /healthz` (na Fly internal proxy) odpovídá `{ "status": "ok" }`.
  Fly automaticky restartuje stroj při třech selháních (`fly.toml`).
- Doporučený externí monitoring: Healthchecks.io / Better Stack na URL
  `https://<fly-app>/healthz` s intervalem 1 min.
- Logy: `flyctl logs --app vividbooks-egress-realitymix` (nebo Fly dashboard).

## Rotace `INTERNAL_EGRESS_TOKEN`

1. Vygenerovat nový token: `openssl rand -base64 48`.
2. `flyctl secrets set INTERNAL_EGRESS_TOKEN=...` (worker se redeployne).
3. Současně `supabase secrets set INTERNAL_EGRESS_TOKEN=...` (Edge Function
   začne posílat nový token; krátké okno nesoulady se vyřeší retry/backoff).

## Změna IPv4

1. `flyctl ips allocate-v4 --shared=false` – přidat novou primární IPv4
   *před* odstraněním té staré.
2. Nahlásit novou IP DALTEN media.
3. Po potvrzení whitelistu starou IP uvolnit: `flyctl ips release <old-ip>`.
4. Aktualizovat tento runbook (sekce „Aktuálně přidělené IP").

## Aktuálně přidělené IP

| Prostředí | IPv4 | Whitelist potvrzen | Poznámka |
| --------- | ---- | ------------------ | -------- |
| production | _doplnit po `fly ips allocate-v4`_ | _doplnit datum_ | primární |
