/**
 * Jednorázově získá GMAIL_REFRESH_TOKEN (rozsahy gmail.readonly + gmail.modify).
 *
 * Která schránka: účet, se kterým v prohlížeči dokončíš Google přihlášení (např. jen hr@vividbooks.com
 * v anonymním okně). Token pak vždy patří jen tomu účtu — pro dedikovaný fakturční účet nic jiného
 * neřeš.
 *
 * Před spuštěním v Google Cloud Console u OAuth klienta (typ Web) přidej přesměrovací URI
 * přesně stejnou jako níže (Google rozlišuje 127.0.0.1 vs localhost).
 * Volitelně: GMAIL_OAUTH_REDIRECT_URI=… musí sedět 1:1 s GCP.
 *
 * Spuštění z apps/web: npm run gmail:token
 */

import { config } from "dotenv";
import { existsSync } from "node:fs";
import http from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const webRoot = resolve(__dirname, "..");
const vercelEnv = resolve(webRoot, ".env.vercel.production");

if (existsSync(vercelEnv)) {
  config({ path: vercelEnv });
}
config({ path: resolve(webRoot, ".env"), override: true });
config();

const DEFAULT_REDIRECT = "http://127.0.0.1:47863/oauth2callback";
const REDIRECT_URI =
  process.env.GMAIL_OAUTH_REDIRECT_URI?.trim() || DEFAULT_REDIRECT;

let redirectUrl;
try {
  redirectUrl = new URL(REDIRECT_URI);
} catch {
  console.error("Neplatná GMAIL_OAUTH_REDIRECT_URI:", REDIRECT_URI);
  process.exit(1);
}
const PORT = Number(redirectUrl.port);
if (!Number.isFinite(PORT) || PORT <= 0) {
  console.error(
    "V redirect URI musí být explicitní port, např. http://127.0.0.1:47863/oauth2callback",
  );
  process.exit(1);
}

const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
const clientSecret =
  process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;

if (!clientId?.trim() || !clientSecret?.trim()) {
  console.error(
    "Chybí GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (nebo GMAIL_*) v .env.",
  );
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  REDIRECT_URI,
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/oauth2callback")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const url = new URL(req.url, `${redirectUrl.protocol}//${redirectUrl.host}`);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<p>OAuth chyba: ${err}</p>`);
    server.close();
    process.exit(1);
    return;
  }
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<p>Chybí parametr <code>code</code>.</p>");
    server.close();
    process.exit(1);
    return;
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    const rt = tokens.refresh_token;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    if (!rt) {
      res.end(
        "<p>Google nevrátil <strong>refresh_token</strong>. Zkus znovu — účet musí udělit souhlas znovu (<code>prompt=consent</code>). " +
          "Případně v Google účtu odeber přístup aplikaci a opakuj.</p>",
      );
      console.error(
        "\nGoogle nevrátil refresh_token. Odeber aplikaci v nastavení účtu Google → Zabezpečení a spusť skript znovu.\n",
      );
    } else {
      res.end(
        "<p>Hotovo. Hodnotu níže zkopíruj do <code>.env</code> jako <code>GMAIL_REFRESH_TOKEN</code>.</p>" +
          `<pre style="word-break:break-all">${rt}</pre>`,
      );
      console.log("\nGMAIL_REFRESH_TOKEN (vlož do .env):\n\n", rt, "\n");
    }
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(e instanceof Error ? e.message : String(e));
    console.error(e);
  }
  server.close();
  process.exit(0);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("\n--- Gmail OAuth (stejný Client ID jako NextAuth) ---\n");
  console.log(
    "Chyba 400 redirect_uri_mismatch = v GCP není přesně tato URI. Zkopíruj ji do:\n" +
      "Google Cloud Console → APIs & Services → Credentials → (tvůj Web client) →\n" +
      "Authorized redirect URIs → + ADD URI\n",
  );
  console.log("Přidej PŘESNĚ tento řádek (bez mezer navíc):");
  console.log(`   ${REDIRECT_URI}\n`);
  console.log("Ulož v GCP, počkej ~1 minutu, pak otevři:\n");
  console.log(authUrl, "\n");
});
