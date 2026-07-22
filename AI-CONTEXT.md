# AI-CONTEXT — phone-bills

Živý souhrn stavu aplikace pro AI agenty. Aktualizuj při každé významné změně.

## Co to je

Interní aplikace pro správu firemních telefonních vyúčtování T-Mobile (zákaznické číslo 56401952).
Parsuje PDF faktury, rozděluje náklady podle skupin (rodina/oddělení), sleduje platby, generuje PDF vyúčtování s QR platbou.

- **Live:** https://phone-bills-tc.fly.dev (Fly app `phone-bills-tc`, volume `/app/uploads`)
- **Porty lokálně:** BE 4250, FE 4251
- **Single-user:** Google OAuth (ALLOWED_EMAIL) + API key pro automatizaci (`X-Api-Key` = Fly secret `AUTOMATION_API_KEY`)

## Datový model (PostgreSQL)

- `groups` — nákladové skupiny (Já, Markéta, Rodiče, …)
- `services` — telefonní čísla / DSL / TV / licence; `group_id` FK
- `invoices` — vyúčtování; `period` (YYYY-MM, **NENÍ unique** — víc faktur pod měsícem OK), `doc_number` (daňový doklad, unique partial index — dedup klíč), `source` (`manual`/`email`)
- `invoice_items` — položky per služba, UNIQUE(invoice_id, service_id)
- `payments` — per (invoice, group); `is_paid` toggle

Migrace jsou idempotentní v `initDB()` (db.ts) včetně backfillu `doc_number` ze starých PDF.

## API poznámky

- `POST /api/invoices/upload` — multipart `file` + volitelně `period`, `source`; 409 při duplicitním doc_number
- `GET /api/payments/summary?period=` — **agregováno per skupina** přes všechny faktury období (`payment_ids[]`, `BOOL_AND(is_paid)`)
- `GET /api/payments/export?period=&group_id=` — PDF s QR (SPAYD, env `PAYMENT_IBAN`); jen nezaplacené
- Parser: `services/pdf-parser.ts` (regex) + `services/ai-parser.ts` (Claude fallback, env `ANTHROPIC_API_KEY`)

## Automatizace (automation/)

- `watcher.mjs` — denní launchd `cz.techcrowd.phone-bills-watcher` (9:00, Mac): Gmail → upload → per-skupina PDF → souhrnný e-mail na novak@techcrowd.cz
- Čte VÍCE schránek: pracovní `~/.claude/gmail-oauth/` + osobní `~/.claude/gmail-oauth-personal/` (config `extra_oauth_dirs`)
- Konfigurace `~/.claude/phone-bills-automation.json`, stav `~/.claude/phone-bills-automation-state.json`
- T-Mobile cyklus: období 6.–5., **vystavení 6. v měsíci**, splatnost 20.
- **Vyúčtování chodí e-mailem na osobní novakmilos7@gmail.com** (`el.vyuctovani@t-mobile.cz`, 8.–11. v měsíci); osobní OAuth = vlastní GCP projekt (External/In production, NEpřepínat do Testing), autorizace `automation/authorize.mjs`
- Ověřeno naostro 22.7.2026: 2026-07 nahráno automaticky z osobní schránky, dedup 2026-06 proti ručnímu uploadu fungoval, souhrnný e-mail se 7 PDF odeslán

## Stav / TODO

- Testy: 45 (vitest, mock pg), CI: GitHub Actions (test + security-audit + deploy na Fly)
