/**
 * Vyprázdnění fronty nezpracované pošty po stránkách (čistá logika, bez Gmailu a DB).
 *
 * Gmail vrací jen první stránku (`maxResults`). Zpracovaná zpráva dostane štítek „Zpracováno“,
 * takže další dotaz vrátí další zprávy — stačí se ptát znovu, dokud něco přibývá a zbývá čas.
 * Zprávu, která se po zpracování v seznamu objeví znovu (štítek se nepřidal), podruhé nezpracujeme
 * a vrátíme ji jako `stuck`, aby smyčka nikdy neběžela dokola.
 */

export type DrainOptions = {
  /** Aktuální seznam ID nezpracovaných zpráv (jedna stránka). */
  listIds: () => Promise<string[]>;
  /** Zpracuje jednu zprávu (stažení příloh, štítek). Chyba ukončí celé vyprázdnění. */
  handle: (id: string) => Promise<void>;
  /** Absolutní čas (ms), po kterém se už nezačíná další zpráva. */
  deadline: number;
  now?: () => number;
  /** Pojistka proti nekonečné smyčce. */
  maxPasses?: number;
};

export type DrainResult = {
  handled: string[];
  /** True = skončilo kvůli času, ve schránce může zbývat další pošta. */
  stoppedEarly: boolean;
  /** Zprávy, které jsou po zpracování pořád v seznamu (nepřidal se štítek). */
  stuck: string[];
  passes: number;
};

export async function drainMessages(opts: DrainOptions): Promise<DrainResult> {
  const now = opts.now ?? Date.now;
  const maxPasses = opts.maxPasses ?? 20;
  const seen = new Set<string>();
  const handled: string[] = [];
  let slowestMs = 0;
  let passes = 0;

  while (passes < maxPasses) {
    passes += 1;
    const ids = await opts.listIds();
    const fresh = ids.filter((id) => !seen.has(id));
    if (fresh.length === 0) {
      return { handled, stoppedEarly: false, stuck: ids.filter((id) => seen.has(id)), passes };
    }
    for (const id of fresh) {
      if (now() + slowestMs >= opts.deadline) {
        return { handled, stoppedEarly: true, stuck: [], passes };
      }
      const t0 = now();
      await opts.handle(id);
      seen.add(id);
      handled.push(id);
      slowestMs = Math.max(slowestMs, now() - t0);
    }
  }
  return { handled, stoppedEarly: true, stuck: [], passes };
}
