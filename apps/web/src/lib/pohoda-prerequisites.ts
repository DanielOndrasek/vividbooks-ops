/**
 * Kontrolní seznam před spolehlivým importem do POHODY (mServer, agendy, DPH).
 * Položky jsou určeny k ověření s účetním / správcem Pohody — aplikace je může zobrazit v administraci.
 */
export type PohodaPrerequisiteItem = {
  id: string;
  title: string;
  detail: string;
};

export const POHODA_PREREQUISITE_CHECKLIST: PohodaPrerequisiteItem[] = [
  {
    id: "agenda",
    title: "Agenda dokladu",
    detail:
      "Potvrdit, zda přijaté doklady jdou jako přijatá faktura (FAP) nebo závazek (Ostatní závazky) a podle toho doladit XML typ a číselné řady v Pohodě.",
  },
  {
    id: "mserver",
    title: "mServer / soubor",
    detail:
      "Běžící mServer nebo ruční import datového souboru; známá URL (např. lokální HTTP), IČO firmy v obálce dataPack a uživatelská práva pro import.",
  },
  {
    id: "dpn-lines",
    title: "DPH a řádky",
    detail:
      "Mapování sazeb DPH (high/low/none) na dokladu; zda stačí jedna syntetická položka, nebo povinné řádky ze skladu/účetního předpisu dle nastavení Pohody.",
  },
  {
    id: "partners",
    title: "Partneři (IČO / DIČ)",
    detail:
      "Jednoznačná identifikace dodavatele podle IČO nebo DIČ vůči číselníku adresáře — duplicity řešit v Pohodě nebo sjednotit extrakci.",
  },
  {
    id: "bank",
    title: "Banka / likvidace",
    detail:
      "Zda příchozí platby importovat do agendy Banka, nebo likvidovat závazky vůči existujícím fakturám; správný účet v hlavičce pohybu (typ:ids).",
  },
];

export function isPohodaMserverConfigured(): boolean {
  return Boolean(
    process.env.POHODA_MSERVER_URL?.trim() && process.env.POHODA_ICO?.trim(),
  );
}
