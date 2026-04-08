/**
 * Nastaví roli uživatele podle e-mailu (tabulka User).
 * Uživatel musí alespoň jednou projít přihlášením přes Google, aby v DB existoval řádek.
 *
 * Načte proměnné přes npm skript (--env-file), nebo musí být DATABASE_URL v prostředí.
 *
 *   npm run db:set-role -- 'hello@vividbooks.com' ADMIN
 *
 * V zsh/bash vždy e-mail v uvozovkách (kvůli znaku @).
 * Nebo: SET_USER_ROLE_EMAIL='hello@...' npm run db:set-role -- '' ADMIN
 */

import pg from "pg";

const email =
  process.env.SET_USER_ROLE_EMAIL?.trim() || process.argv[2]?.trim();
const roleArg = (
  process.env.SET_USER_ROLE?.trim() ||
  process.argv[3] ||
  "ADMIN"
).trim().toUpperCase();
const allowed = new Set(["ADMIN", "APPROVER", "VIEWER"]);

if (!email || !email.includes("@")) {
  console.error(
    "Použití: npm run db:set-role -- '<email>' [ADMIN|APPROVER|VIEWER]\n" +
      "  (e-mail musí být v uvozovkách kvůli @)\n" +
      "Nebo: SET_USER_ROLE_EMAIL='you@firma.cz' npm run db:set-role -- '' ADMIN",
  );
  process.exit(1);
}
if (!allowed.has(roleArg)) {
  console.error("Neplatná role:", roleArg);
  process.exit(1);
}

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error(
    "Chybí DATABASE_URL. Spusť z apps/web po vercel env pull:\n" +
      "  npm run db:set-role -- 'email@domena.cz' ADMIN",
  );
  process.exit(1);
}

async function main() {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    const res = await client.query(
      `UPDATE "User" SET role = $1::"UserRole" WHERE LOWER(TRIM(email)) = LOWER(TRIM($2))`,
      [roleArg, email],
    );
    console.log(`Hotovo. Upraveno řádků: ${res.rowCount} (${email} → ${roleArg}).`);
    if (res.rowCount === 0) {
      console.log(
        "\nŽádný řádek s tímto e-mailem — přihlas se jednou do aplikace Google účtem a spusť příkaz znovu.",
      );
      process.exitCode = 2;
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
