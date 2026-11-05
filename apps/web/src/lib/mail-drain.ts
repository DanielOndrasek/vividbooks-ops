/**
 * Vyprázdnění fronty nezpracované pošty po stránkách (čistá logika, bez Gmailu a DB).
 *
 * Zpracovaná zpráva dostane štítek „Zpracováno“ a z dotazu zmizí, takže po zpracování stránky
 * se ptáme znovu od začátku. Zprávu, která se po zpracování v seznamu objeví znovu (štítek se
 * nepřidal), podruhé nezpracujeme: vrátíme ji jako `stuck` a když jimi je zaplněná celá stránka,
 * jdeme přes `nextPageToken` na další stránku — pošta za nimi se tak neztratí.
 */

export type MessagePage = { ids: string[]; nextPageToken?: string };

export type DrainOptions = {
  /** Jedna stránka ID nezpracovaných zpráv (bez tokenu = od začátku). */
  listPage: (pageToken?: string) => Promise<MessagePage>;
  /** Zpracuje jednu zprávu (stažení příloh, štítek). Chyba ukončí celé vyprázdnění. */
  handle: (id: string) => Promise<void>;
  /** Absolutní čas (ms), po kterém se už nezačíná další zpráva. */
  deadline: number;
  now?: () => number;
  /** Pojistka proti nekonečné smyčce (počet dotazů na Gmail). */
  maxPasses?: number;
};

export type DrainResult = {
  handled: string[];
  /** True = skončilo kvůli času (nebo pojistce), ve schránce může zbývat další pošta. */
  stoppedEarly: boolean;
  /** Zprávy, které jsou po zpracování pořád v seznamu (nepřidal se štítek). */
  stuck: string[];
  passes: number;
};

export async function drainMessages(opts: DrainOptions): Promise<DrainResult> {
  const now = opts.now ?? Date.now;
  const maxPasses = opts.maxPasses ?? 50;
  const seen = new Set<string>();
  const stuck = new Set<string>();
  const handled: string[] = [];
  let slowestMs = 0;
  let passes = 0;
  let pageToken: string | undefined;

  while (passes < maxPasses) {
    passes += 1;
    const page = await opts.listPage(pageToken);
    const fresh = page.ids.filter((id) => !seen.has(id));
    for (const id of page.ids) {
      if (seen.has(id)) stuck.add(id);
    }
    if (fresh.length === 0) {
      if (page.nextPageToken) {
        pageToken = page.nextPageToken; // stránka plná zaseknutých → další stránka
        continue;
      }
      return { handled, stoppedEarly: false, stuck: [...stuck], passes };
    }
    for (const id of fresh) {
      if (now() + slowestMs >= opts.deadline) {
        return { handled, stoppedEarly: true, stuck: [...stuck], passes };
      }
      const t0 = now();
      await opts.handle(id);
      seen.add(id);
      handled.push(id);
      slowestMs = Math.max(slowestMs, now() - t0);
    }
    pageToken = undefined; // zpracované zmizely z dotazu → znovu od začátku
  }
  return { handled, stoppedEarly: true, stuck: [...stuck], passes };
}
