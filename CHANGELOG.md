# Changelog

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
