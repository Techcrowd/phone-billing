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
  const text = data.text;

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
    rawText: text
  };
}

function parseAmount(str: string): number {
  return parseFloat(str.replace(/\s/g, '').replace(',', '.'));
}
