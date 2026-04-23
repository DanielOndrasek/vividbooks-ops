import { escapeXmlText } from "@/services/pohoda/xml-escape";

const NS_DAT = "http://www.stormware.cz/schema/version_2/data.xsd";
const NS_INV = "http://www.stormware.cz/schema/version_2/invoice.xsd";
const NS_TYP = "http://www.stormware.cz/schema/version_2/type.xsd";
const NS_BNK = "http://www.stormware.cz/schema/version_2/bank.xsd";

export function wrapDataPackItem(itemId: string, innerXml: string): string {
  return `<dat:dataPackItem id="${escapeXmlText(itemId)}" version="2.0">${innerXml}</dat:dataPackItem>`;
}

export function wrapDataPackRoot(params: {
  packId: string;
  ico: string;
  application: string;
  note?: string;
  itemsXml: string;
}): string {
  const note = params.note ?? "Import";
  return `<?xml version="1.0" encoding="utf-8"?>
<dat:dataPack xmlns:dat="${NS_DAT}"
  xmlns:inv="${NS_INV}"
  xmlns:typ="${NS_TYP}"
  xmlns:bnk="${NS_BNK}"
  id="${escapeXmlText(params.packId)}"
  ico="${escapeXmlText(params.ico)}"
  application="${escapeXmlText(params.application)}"
  version="2.0"
  note="${escapeXmlText(note)}">
${params.itemsXml}
</dat:dataPack>`;
}
