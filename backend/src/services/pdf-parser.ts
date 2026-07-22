import pdf from 'pdf-parse';
import fs from 'fs';

export interface ParsedItem {
  phoneNumber: string;
  serviceName: string;
  amountNoDph: number;
  amountNonDph: number;  // SMS platby apod. (nepodléhají DPH)
  amountWithDph: number; // celkem včetně DPH
}

export interface ParseResult {
  success: boolean;
  items: ParsedItem[];
  totalAmount: number;   // celková částka k úhradě
  totalNoDph: number;    // celkem bez DPH
  dphRate: number;       // sazba DPH (0.21)
  period: string;        // "2026-02"
  periodText: string;    // "6.1. - 5.2.2026"
  docNumber: string | null; // "Daňový doklad číslo" — unikátní pro každé vyúčtování
  rawText: string;
  error?: string;
}

/**
 * Parsuje T-Mobile PDF fakturu.
 *
 * Formát: sekce "Přehled služeb po číslech" obsahuje bloky:
 *   {id} / {název služby}
 *   ...
 *   Celkem za služby bez DPH{částka} Kč
 *   [Celkem za položky nepodléhající DPH{částka} Kč]
 */
export async function parseTMobilePDF(filePath: string): Promise<ParseResult> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  return parseTMobileText(data.text);
}

export function parseTMobileText(text: string): ParseResult {
  // Jiný typ dokladu: "Vyúčtování smluvní pokuty" (např. nevrácené zařízení) — jednopoložkový doklad bez DPH
  if (/Vyúčtování smluvní pokuty/i.test(text)) {
    return parsePenaltyText(text);
  }

  // Období: "za období 6.1. - 5.2.2026"
  let period = '';
  let periodText = '';
  const periodMatch = text.match(/za období\s+([\d.]+\s*-\s*[\d.]+(\d{4}))/i);
  if (periodMatch) {
    periodText = periodMatch[1].trim();
    // Extrahuj měsíc a rok z koncového data (např. "5.2.2026" → 2026-02)
    const endDateMatch = periodText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (endDateMatch) {
      const month = endDateMatch[2].padStart(2, '0');
      period = `${endDateMatch[3]}-${month}`;
    }
  }

  // Celková částka k úhradě: "Částka k úhradě6 581,13 Kč"
  let totalAmount = 0;
  const totalMatch = text.match(/Částka k úhradě([\d\s]+,\d{2})\s*Kč/);
  if (totalMatch) {
    totalAmount = parseAmount(totalMatch[1]);
  }

  // Celkem za služby bez DPH (hlavní): "Celkem za služby bez DPH5 300,11 Kč" (na první stránce)
  let totalNoDph = 0;
  const noDphMatch = text.match(/Celkem za služby bez DPH([\d\s]+,\d{2})\s*Kč/);
  if (noDphMatch) {
    totalNoDph = parseAmount(noDphMatch[1]);
  }

  // DPH sazba
  const dphRateMatch = text.match(/DPH\s*\((\d+)%\)/);
  const dphRate = dphRateMatch ? parseInt(dphRateMatch[1]) / 100 : 0.21;

  // Číslo daňového dokladu: "Daňový doklad číslo2313523225"
  const docNumberMatch = text.match(/Daňový doklad číslo\s*(\d+)/);
  const docNumber = docNumberMatch ? docNumberMatch[1] : null;

  // Najdi sekci "Přehled služeb po číslech"
  const detailStart = text.indexOf('Přehled služeb po číslech');
  if (detailStart === -1) {
    return {
      success: false,
      items: [],
      totalAmount,
      totalNoDph,
      dphRate,
      period,
      periodText,
      docNumber,
      rawText: text,
      error: 'Sekce "Přehled služeb po číslech" nenalezena'
    };
  }

  const detailText = text.substring(detailStart);

  // Pattern pro hlavičku sekce čísla:
  // "604413020 / Next internet 5 GB"
  // "DSL2821682 / Pevný internet pro firmy L"
  // "LIC00122398 / Služby Norton"
  // "TV132635271 / MAGENTA TV M Plus"
  const sectionPattern = /^(\d{9}|DSL\d+|LIC\d+|TV\d+)\s*\/\s*(.+)$/gm;

  // Najdi všechny sekce
  const sections: { id: string; name: string; startIndex: number }[] = [];
  let sMatch;
  while ((sMatch = sectionPattern.exec(detailText)) !== null) {
    sections.push({
      id: sMatch[1],
      name: sMatch[2].trim(),
      startIndex: sMatch.index
    });
  }

  // Zpracuj každou sekci
  const items: ParsedItem[] = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const nextStart = i + 1 < sections.length ? sections[i + 1].startIndex : detailText.length;
    const sectionText = detailText.substring(section.startIndex, nextStart);

    // "Celkem za služby bez DPH382,68 Kč"
    let amountNoDph = 0;
    const amtMatch = sectionText.match(/Celkem za služby bez DPH([\d\s]+,\d{2})\s*Kč/);
    if (amtMatch) {
      amountNoDph = parseAmount(amtMatch[1]);
    }

    // "Celkem za položky nepodléhající DPH84,00 Kč"
    let amountNonDph = 0;
    const nonDphMatch = sectionText.match(/Celkem za položky nepodléhající DPH([\d\s]+,\d{2})\s*Kč/);
    if (nonDphMatch) {
      amountNonDph = parseAmount(nonDphMatch[1]);
    }

    // Celkem včetně DPH = služby * (1 + DPH) + položky nepodléhající DPH
    const amountWithDph = Math.round((amountNoDph * (1 + dphRate) + amountNonDph) * 100) / 100;

    items.push({
      phoneNumber: section.id,
      serviceName: section.name,
      amountNoDph,
      amountNonDph,
      amountWithDph
    });
  }

  return {
    success: items.length > 0,
    items,
    totalAmount,
    totalNoDph,
    dphRate,
    period,
    periodText,
    docNumber,
    rawText: text
  };
}

/**
 * "Vyúčtování smluvní pokuty" — samostatný doklad (např. za nevrácené zařízení).
 * Nemá "za období" ani "Přehled služeb po číslech"; období se bere z DUZP,
 * částka nepodléhá DPH a přiřadí se službě uvedené v tabulce Účtované položky.
 */
function parsePenaltyText(text: string): ParseResult {
  const docNumberMatch = text.match(/Doklad číslo\s*:?\s*(\d+)/);
  const docNumber = docNumberMatch ? docNumberMatch[1] : null;

  let period = '';
  let periodText = '';
  const duzpMatch = text.match(/Datum vystavení\s*\/\s*DUZP\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (duzpMatch) {
    period = `${duzpMatch[3]}-${duzpMatch[2].padStart(2, '0')}`;
    periodText = `DUZP ${duzpMatch[1]}.${duzpMatch[2]}.${duzpMatch[3]}`;
  }

  let totalAmount = 0;
  const totalMatch = text.match(/Celkem k úhradě\s*(?:\(Kč\))?\s*([\d\s]+,\d{2})/);
  if (totalMatch) {
    totalAmount = parseAmount(totalMatch[1]);
  }

  // Název dokladu, např. "Smluvní pokuta - Pronájem zařízení"
  const titleMatch = text.match(/^(Smluvní pokuta[^\n]*)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Smluvní pokuta';

  // Služba, ke které se pokuta vztahuje — hledej jen v tabulce Účtované položky
  const itemsStart = text.indexOf('Účtované položky');
  const itemsText = itemsStart >= 0 ? text.substring(itemsStart) : text;
  const serviceMatch = itemsText.match(/(DSL\d+|TV\d+|LIC\d+|(?<!\d)\d{9}(?!\d))/);

  const items: ParsedItem[] = [];
  if (serviceMatch && totalAmount > 0) {
    items.push({
      phoneNumber: serviceMatch[1],
      serviceName: title,
      amountNoDph: 0,
      amountNonDph: totalAmount,
      amountWithDph: totalAmount,
    });
  }

  return {
    success: items.length > 0 && !!period,
    items,
    totalAmount,
    totalNoDph: 0,
    dphRate: 0.21,
    period,
    periodText,
    docNumber,
    rawText: text,
    ...(items.length === 0 || !period ? { error: 'Doklad smluvní pokuty se nepodařilo naparsovat' } : {}),
  };
}

function parseAmount(str: string): number {
  return parseFloat(str.replace(/\s/g, '').replace(',', '.'));
}
