# Phone Bills

Interní aplikace pro správu firemních telefonních vyúčtování T-Mobile. Parsuje PDF faktury, rozděluje náklady podle skupin (oddělení/osoby) a sleduje platby.

**Live:** https://phone-bills-tc.fly.dev

## Funkce

- **Upload PDF faktur** — automatický parsing T-Mobile vyúčtování (regex + Claude AI fallback)
- **Skupiny služeb** — přiřazení telefonních čísel / DSL / TV k nákladovým střediskům
- **Sledování plateb** — kdo kolik dluží, toggle zaplaceno/nezaplaceno
- **PDF export** — generování vyúčtování s QR kódem pro bankovní platbu (SPAYD)
- **Dashboard** — přehled KPI, stav plateb za aktuální období
- **Google OAuth** — single-user autentizace

## Tech Stack

| Vrstva | Technologie |
|--------|------------|
| Frontend | Angular 21, Tailwind CSS v4, TypeScript |
| Backend | Express 5, TypeScript (ESM), PDFKit, QRCode |
| Databáze | PostgreSQL 16 |
| Auth | Google OAuth2 (ID token) |
| CI/CD | GitHub Actions → Fly.io |
| Testy | Vitest (backend, 38 testů) |

## Quick Start

### Prerekvizity

- Node.js 22+
- Docker (pro PostgreSQL)

### 1. Spustit databázi

```bash
docker compose up -d db
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Vyplnit .env (GOOGLE_CLIENT_ID, ALLOWED_EMAIL, DATABASE_URL)
npm install
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
npm start
```

Aplikace běží na http://localhost:4251 (proxy na backend :4250).

## Struktura projektu

```
phone-bills/
├── backend/                 # Express API + PDF parser
│   ├── src/
│   │   ├── server.ts        # Entry point, middleware
│   │   ├── db.ts            # PostgreSQL pool + schema
│   │   ├── middleware/
│   │   │   └── auth.ts      # Google OAuth verifikace
│   │   ├── routes/
│   │   │   ├── groups.ts    # CRUD skupiny
│   │   │   ├── invoices.ts  # Upload + parsing faktur
│   │   │   ├── payments.ts  # Platby + PDF export
│   │   │   └── services.ts  # Telefonní služby
│   │   ├── services/
│   │   │   ├── pdf-parser.ts   # T-Mobile regex parser
│   │   │   └── ai-parser.ts    # Claude AI fallback
│   │   └── __tests__/       # Vitest unit testy
│   ├── .env.example
│   └── vitest.config.ts
├── frontend/                # Angular 21 SPA
│   ├── src/app/
│   │   ├── pages/           # 6 stránek (login, dashboard, invoices, groups, payments)
│   │   ├── services/        # API + Auth service
│   │   ├── models/          # TypeScript interfaces
│   │   └── guards/          # Auth guard
│   ├── eslint.config.js
│   ├── .prettierrc
│   └── postcss.config.js
├── docker-compose.yml       # PostgreSQL + backend + frontend
├── Dockerfile               # Multi-stage build pro Fly.io
├── fly.toml                 # Fly.io konfigurace
└── .github/workflows/ci.yml # CI/CD pipeline
```

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`):

1. **Backend** — `npm ci` → `tsc` (type check) → `vitest run` (38 testů)
2. **Frontend** — `npm ci` → `ng lint` (ESLint) → `ng build` (produkční build)
3. **Deploy** — `flyctl deploy` na Fly.io (jen po úspěšném CI, jen na `main`)

## Deployment (Fly.io)

- **App:** `phone-bills-tc` (Frankfurt)
- **DB:** `phone-bills-db` (Fly Postgres)
- **VM:** shared-cpu-1x, 512 MB RAM
- **Auto-stop:** zapnuto (šetří náklady při nečinnosti)
- **Volume:** 1 GB pro uploaded PDF

### Secrets

```bash
flyctl secrets set -a phone-bills-tc \
  GOOGLE_CLIENT_ID=... \
  ALLOWED_EMAIL=... \
  PAYMENT_IBAN=...
```

`DATABASE_URL` se nastavuje automaticky přes Fly Postgres attach.

## Databázové schéma

```
groups          services           invoices
├── id (PK)     ├── id (PK)        ├── id (PK)
├── name        ├── identifier     ├── period (UNIQUE)
├── note        ├── label          ├── total_with_vat
└── created_at  ├── type           ├── total_without_vat
                ├── group_id (FK)  ├── dph_rate
                └── created_at     ├── file_path
                                   └── imported_at

invoice_items              payments
├── id (PK)                ├── id (PK)
├── invoice_id (FK)        ├── invoice_id (FK)
├── service_id (FK)        ├── group_id (FK)
├── amount_with_vat        ├── amount
├── amount_without_vat     ├── amount_without_vat
└── amount_vat_exempt      ├── is_paid
                           └── paid_at
```

## Porty

| Služba | Port |
|--------|------|
| Backend API | 4250 |
| Frontend dev | 4251 |
| PostgreSQL (Docker) | 5433 |
