# GitHub Encrypted Secrets → Vercel (a Streamlit Cloud)

Tento repozitář používá **GitHub Repository secrets** jako jedno centrální místo, ze kterého se tajemství **odešlou na Vercel** (web `apps/web`). **Streamlit Cloud** zatím vyplň ručně ze stejného seznamu (jejich API pro hromadný import je omezené).

## 1. Vytvoř projekt na Vercelu

1. Import repozitáře **vividbooks-ops**.
2. **Root Directory:** `apps/web`.
3. Dokonči první deploy (může selhat bez env — po synci znovu deploy).

## 2. Token a ID pro GitHub

V [Vercel → Account Settings → Tokens](https://vercel.com/account/tokens) vytvoř token s rozsahem pro tým/projekt.

**Team / Project ID:** ve Vercelu otevři projekt → *Settings → General* — *Project ID* a pod *Team* *Team ID* (někdy označeno jako Org ID).

Do GitHubu: **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Popis |
|--------|--------|
| `VERCEL_TOKEN` | Token z Vercelu |
| `VERCEL_ORG_ID` | Team ID (Org ID) |
| `VERCEL_PROJECT_ID` | ID projektu webové aplikace |

## 3. Aplikační secrets (stejné názvy jako v `apps/web/.env.example`)

Přidej jako repository secrets (hodnoty neukládej do gitu):

| Secret | Poznámka |
|--------|----------|
| `DATABASE_URL` | PostgreSQL (Supabase, Neon, …) |
| `AUTH_SECRET` | Náhodný řetězec ≥ 32 znaků |
| `NEXTAUTH_URL` | Produkční URL webu, např. `https://tvuj-projekt.vercel.app` |
| `GOOGLE_CLIENT_ID` | OAuth NextAuth |
| `GOOGLE_CLIENT_SECRET` | OAuth NextAuth |
| `ALLOWED_EMAIL_DOMAIN` | Volitelné (Workspace doména) |
| `GMAIL_CLIENT_ID` | Volitelné; jinak se bere z Google OAuth |
| `GMAIL_CLIENT_SECRET` | |
| `GMAIL_REFRESH_TOKEN` | Gmail API |
| `GMAIL_FILTER_LABEL` | Volitelné |
| `GMAIL_PROCESSED_LABEL` | Volitelné |
| `GMAIL_POLL_MAX_RESULTS` | Volitelné |
| `CRON_SECRET` | Tajný řetězec pro Vercel Cron (`Authorization: Bearer …`) |
| `INVOICE_TMP_DIR` | Na Vercelu často prázdné (temp je efemérní) |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` | Celý JSON service accountu (jedna hodnota) |
| `GOOGLE_DRIVE_INVOICES_FOLDER_ID` | Složka na Shared Drive |
| `GOOGLE_DRIVE_RECEIPTS_FOLDER_ID` | Složka na Shared Drive |
| `ANTHROPIC_API_KEY` | Claude |
| `ANTHROPIC_MODEL` | Volitelné |
| `AI_CONFIDENCE_THRESHOLD` | Volitelné |
| `AI_BATCH_LIMIT` | Volitelné |

Prázdné volitelné secrets workflow přeskočí (v logu bude „Přeskakuji prázdné“).

## 4. Spuštění synchronizace na Vercel

**Actions → „Sync secrets to Vercel“ → Run workflow.**

Skript nastaví proměnné pro prostředí **production** i **preview** (aby fungovaly i PR deploye).

Potom na Vercelu spusť **Redeploy** posledního buildu nebo pushni commit.

Migrace DB (jednorázově z počítače s produkčním `DATABASE_URL`):

```bash
cd apps/web && npx prisma migrate deploy
```

## 5. Streamlit Cloud

V [share.streamlit.io](https://share.streamlit.io) v **Secrets** zkopíruj stejné hodnoty, které potřebuje Streamlit (Pipedrive, `DOKLADY_APP_URL` = URL z Vercelu, …). GitHub Actions je na Streamlit zatím neposílá — zdroj pravdy je seznam výše; po změně aktualizuj obě konzole, dokud nepřidáme druhý workflow.

## 6. Rotace klíče

1. Uprav secret v GitHubu.  
2. Znovu spusť workflow **Sync secrets to Vercel**.  
3. Uprav Streamlit Secrets ručně, pokud se klíč týká i hubu.
