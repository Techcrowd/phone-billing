# Phone Bills — Backend

Express API pro správu telefonních vyúčtování. Parsuje T-Mobile PDF faktury, spravuje skupiny služeb a generuje PDF exporty plateb s QR kódy.

## Setup

```bash
cp .env.example .env
# Vyplnit .env
npm install
npm run dev
```

## Skripty

| Skript | Popis |
|--------|-------|
| `npm run dev` | Dev server s hot reload (tsx watch) |
| `npm run build` | TypeScript kompilace do `dist/` |
| `npm start` | Produkční spuštění (`node dist/server.js`) |
| `npm test` | Vitest unit testy (38 testů) |

## Environment Variables

| Proměnná | Povinná | Popis |
|----------|---------|-------|
| `DATABASE_URL` | ano | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | ano | Google OAuth2 Client ID |
| `ALLOWED_EMAIL` | ano | Povolený email pro přístup |
| `PORT` | ne | Port serveru (default: 4250) |
| `PAYMENT_IBAN` | ne | IBAN pro QR kód v PDF exportu |
| `ANTHROPIC_API_KEY` | ne | Claude API klíč pro AI fallback parsing |
| `UPLOAD_DIR` | ne | Adresář pro uploaded PDF (default: `./uploads`) |

## API Endpoints

### Veřejné (bez autentizace)

| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/health` | Health check |
| GET | `/api/config` | Google Client ID pro frontend |

### Skupiny

| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/groups` | Seznam skupin se službami |
| POST | `/api/groups` | Vytvořit skupinu (`{ name, note? }`) |
| PUT | `/api/groups/:id` | Upravit skupinu |
| DELETE | `/api/groups/:id` | Smazat skupinu |

### Faktury

| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/invoices` | Seznam faktur s počty služeb a plateb |
| GET | `/api/invoices/:id` | Detail faktury — rozpis po skupinách |
| POST | `/api/invoices/upload` | Upload PDF (multipart, pole `file`) |
| DELETE | `/api/invoices/:id` | Smazat fakturu + PDF soubor |

### Platby

| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/payments` | Seznam plateb (`?period=&group_id=`) |
| GET | `/api/payments/summary` | Agregovaný přehled (`?period=`) |
| GET | `/api/payments/export` | PDF export s QR kódem (`?period=&group_id=`) |
| POST | `/api/payments/generate` | Generovat platby z faktury (`{ invoice_id }`) |
| PUT | `/api/payments/:id` | Toggle zaplaceno (`{ is_paid }`) |

### Služby

| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/services` | Seznam všech služeb |
| PUT | `/api/services/:id` | Přiřadit skupinu / změnit label |

## PDF Parsing

### T-Mobile Parser (`services/pdf-parser.ts`)

Regex parser pro české T-Mobile faktury:

1. Detekce období z textu `"za období 6.1. - 5.2.2026"`
2. Extrakce celkových částek (s DPH, bez DPH)
3. Parsing sekce `"Přehled služeb po číslech"` — rozpad na jednotlivé služby
4. Auto-detekce typu: `phone`, `dsl`, `tv`, `license` podle identifikátoru

### AI Fallback (`services/ai-parser.ts`)

Pokud regex parser nenajde žádné položky a je nastaven `ANTHROPIC_API_KEY`, použije se Claude Sonnet 4 pro extrakci dat z PDF textu.

## Testy

```bash
npm test
```

38 testů pokrývá všechny endpointy:

| Soubor | Testů | Pokrytí |
|--------|-------|---------|
| `health.test.ts` | 2 | Health endpoint |
| `groups.test.ts` | 11 | CRUD + validace + duplikáty |
| `invoices.test.ts` | 7 | List, detail, delete + 404 |
| `payments.test.ts` | 12 | Generate, list, summary, toggle |
| `services.test.ts` | 6 | List, update group/label |

Testy mockují PostgreSQL pool a auth middleware — nepotřebují skutečnou DB.

## Architektura

```
server.ts
├── cors + json middleware
├── /uploads static serve
├── GET /api/health (public)
├── GET /api/config (public)
├── authMiddleware ──────────┐
├── /api/groups   ← groups.ts    │
├── /api/invoices ← invoices.ts  │ chráněno
├── /api/payments ← payments.ts  │ Google OAuth
├── /api/services ← services.ts  │
├── global error handler ────────┘
└── static frontend (production)
```
