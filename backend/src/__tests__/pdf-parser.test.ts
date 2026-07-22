import { describe, it, expect } from 'vitest';
import { parseTMobileText } from '../services/pdf-parser.js';

const PENALTY_TEXT = `Vyúčtování smluvní pokuty
Doklad číslo : 9326037014
Dodavatel
T-Mobile Czech Republic a.s.
Zákazník
Miloš Novák
Doklad číslo9326037014
Fakturační skupina56401952
Datum vystavení / DUZP14.07.2026
Datum splatnosti28.07.2026
Údaje pro platbu
Bankovní účet
19-2235210247
Variabilní symbol
9156401952
Celkem k úhradě
1 000,00 Kč
Smluvní pokuta - Pronájem zařízení
V souladu se smlouvou o pronájmu koncového zařízení Vám účtujeme smluvní pokutu.
Účtované položky
Účastnická smlouvaČíslo službySeriové číslo zařízeníNázev zařízeníČástka k úhradě (Kč)
67786345DSL2821682S192E27005189ZyXEL VMG3312-T20A1 000,00
Celkem k úhradě (Kč)1 000,00
Strana 1 / 1`;

describe('parseTMobileText — smluvní pokuta', () => {
  it('parses penalty document (F-*.pdf)', () => {
    const r = parseTMobileText(PENALTY_TEXT);
    expect(r.success).toBe(true);
    expect(r.docNumber).toBe('9326037014');
    expect(r.period).toBe('2026-07');
    expect(r.totalAmount).toBe(1000);
    expect(r.totalNoDph).toBe(0);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].phoneNumber).toBe('DSL2821682');
    expect(r.items[0].serviceName).toContain('Smluvní pokuta');
    expect(r.items[0].amountNonDph).toBe(1000);
    expect(r.items[0].amountWithDph).toBe(1000);
    expect(r.items[0].amountNoDph).toBe(0);
  });

  it('fails gracefully when penalty has no service reference', () => {
    const r = parseTMobileText('Vyúčtování smluvní pokuty\nDoklad číslo : 123\nCelkem k úhradě\n500,00 Kč');
    expect(r.success).toBe(false);
    expect(r.error).toBeDefined();
  });
});

describe('parseTMobileText — běžné vyúčtování', () => {
  it('parses standard invoice header fields', () => {
    const text = `Vyúčtování služeb
za období 6.6. - 5.7.2026
Variabilní symbol9156401952
Daňový doklad číslo2431053126
Částka k úhradě6 678,43 Kč
Celkem za služby bez DPH5 300,11 Kč
DPH (21%)
Přehled služeb po číslech
604413020 / Next internet 5 GB
Celkem za služby bez DPH130,00 Kč`;
    const r = parseTMobileText(text);
    expect(r.success).toBe(true);
    expect(r.period).toBe('2026-07');
    expect(r.docNumber).toBe('2431053126');
    expect(r.totalAmount).toBe(6678.43);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].phoneNumber).toBe('604413020');
  });
});
