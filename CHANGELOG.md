# Changelog

## 2.1.2 — 2026-08-04

- Fix parseru: jednoslužbové vyúčtování (jen jedno telefonní číslo/DSL na dokladu) — T-Mobile v tomto případě sekci „Přehled služeb po číslech" vůbec nevytiskne, parser vracel 0 položek a faktura se uložila bez `invoice_items`/`payments`. Nově fallback na řádek `{id} / {název služby}` ze „Souhrnný přehled služeb" + částky z hlavičky dokladu.
- Fix: přiřazení/změna fakturační skupiny u služby (`PUT /api/services/:id`) teď přepočítá `payments` u všech faktur, kde se služba vyskytuje — dřív platby zůstaly „zamrzlé" ve stavu skupin z doby uploadu a nově vytvořená/přeřazená skupina se v přehledu plateb neobjevila, dokud se faktura ručně znovu nenahrála. Sdílená logika přesunuta do `services/payments.ts` (`regenerateInvoicePayments`), použita i v `POST /api/invoices/upload` a `POST /api/payments/generate`; navíc maže nezaplacené platby skupin, které už u faktury nemají žádnou položku.

## 2.1.1 — 2026-07-22

- Parser: podpora dokladů **smluvní pokuty** (`F-<číslo>.pdf`, „Vyúčtování smluvní pokuty") — období z DUZP, částka bez DPH, přiřazení službě z tabulky Účtované položky
- Watcher: `F-*.pdf` v attachment patternu — nahrává se každý doklad z e-mailu, ne jen měsíční vyúčtování

## 2.1.0 — 2026-07-22

### Více vyúčtování pod jedním měsícem
- Zrušen UNIQUE constraint na `invoices.period` — jedno období může mít více faktur
- Deduplikace podle **čísla daňového dokladu** (`doc_number`, parsováno z PDF, unikátní index) — opakovaný upload stejného vyúčtování vrátí 409
- Backfill `doc_number` pro existující faktury z uložených PDF (automaticky při startu)
- Nový sloupec `invoices.source` (`manual` / `email`) — odlišení ručního uploadu od automatického
- `GET /api/payments/summary` agreguje skupiny přes všechna vyúčtování v období (jedna řádka na skupinu, `BOOL_AND(is_paid)`, `payment_ids[]`)
- PDF export: bloky v rámci téhož období rozlišené číslem dokladu („· doklad 231…")
- Frontend: číslo dokladu + badge „e-mail" v seznamu faktur a detailu

### Automatizace z e-mailu (Gmail watcher)
- `automation/watcher.mjs` — denní launchd job (`cz.techcrowd.phone-bills-watcher`, 9:00):
  Gmail (`from:t-mobile.cz filename:pdf`) → upload do aplikace → PDF vyúčtování per skupina → souhrnný e-mail k přeposlání
- Backend: API-key autentizace pro automatizaci (`X-Api-Key` vs. Fly secret `AUTOMATION_API_KEY`, timing-safe)
- Bez npm závislostí (Node 22 fetch/FormData), Gmail OAuth sdílené v `~/.claude/gmail-oauth/`

### Testy
- +7 testů (upload dedup, multi-period, API-key auth) — celkem 45

## 2.0.0 — 2026-02

- Migrace SQLite → PostgreSQL, Fly.io deploy, pentest remediace (10/12 findings)
- Security audit v CI (npm audit + gitleaks)

## 1.0.0 — 2026-02

- První verze: upload T-Mobile PDF, parsing (regex + Claude AI fallback), skupiny, platby, PDF export s QR (SPAYD), Google OAuth
