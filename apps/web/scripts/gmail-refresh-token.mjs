/**
 * Jednorázově získá GMAIL_REFRESH_TOKEN (rozsahy gmail.readonly + gmail.modify).
 *
 * Před spuštěním v Google Cloud Console u OAuth klienta (typ Web) přidej přesměrovací URI:
 *   http://127.0.0.1:47863/oauth2callback
 *
 * Spuštění z kořene invoice-portal:
 *   npm run gmail:token
 */

import { config } from "dotenv";
import http from "node:http";
import { google } from "googleapis";

config();

const PORT = 47863;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;

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
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
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

server.listen(PORT, "127.0.0.1", () => {
  console.log("\n1) V Google Cloud → OAuth klient → Authorized redirect URIs přidej:");
  console.log(`   ${REDIRECT_URI}\n`);
  console.log("2) Otevři v prohlížeči:\n");
  console.log(authUrl, "\n");
});
