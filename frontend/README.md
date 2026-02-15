# Phone Bills — Frontend

Angular 21 SPA pro správu telefonních vyúčtování. Tailwind CSS v4 pro styling, signals pro state management, OnPush change detection.

## Setup

```bash
npm install
npm start
```

Dev server běží na http://localhost:4251 s proxy na backend (:4250).

## Skripty

| Skript | Popis |
|--------|-------|
| `npm start` | Dev server s hot reload (port 4251) |
| `npm run build` | Produkční build do `dist/frontend/` |
| `npm run lint` | ESLint kontrola (@angular-eslint) |
| `npm run format` | Prettier formátování všech souborů |

## Stránky

| Route | Komponenta | Popis |
|-------|-----------|-------|
| `/login` | LoginPage | Google OAuth přihlášení |
| `/dashboard` | DashboardPage | KPI karty, přehled plateb, poslední faktury |
| `/invoices` | InvoicesPage | Seznam faktur, upload PDF |
| `/invoices/:id` | InvoiceDetailPage | Detail faktury — rozpis služeb po skupinách |
| `/groups` | GroupsPage | Správa skupin služeb (CRUD), přiřazení čísel |
| `/payments` | PaymentsPage | Sledování plateb, filtry, PDF export |

Všechny stránky kromě `/login` chráněny `authGuard`.

## Architektura

```
src/app/
├── app.ts / app.html        # Root — header s hamburger menu + router-outlet
├── app.config.ts             # Providers (HttpClient, Router, interceptor)
├── app.routes.ts             # Lazy-loaded routes
├── models/
│   └── models.ts             # 7 interfaces (Group, Service, Invoice, Payment, ...)
├── services/
│   ├── api.service.ts        # Veškerá HTTP komunikace s backendem
│   └── auth.service.ts       # Token management (localStorage)
├── guards/
│   └── auth.guard.ts         # Redirect na /login pokud není token
└── pages/
    ├── login/                # Google Sign-In button
    ├── dashboard/            # Signály: summary, invoices, loading
    ├── invoices/             # Upload + seznam + detail (2 komponenty)
    ├── groups/               # CRUD skupin, přiřazení služeb, editace labelů
    └── payments/             # Filtry, toggle zaplaceno, PDF export
```

## Konvence

- **Standalone komponenty** — žádné moduly, importy přímo v `@Component`
- **Separate files** — vždy `component.ts` + `component.html` (nikdy inline template)
- **Signals** — `signal()`, `computed()` pro veškerý lokální state
- **inject()** — místo constructor injection
- **OnPush** — `ChangeDetectionStrategy.OnPush` na všech komponentách
- **takeUntilDestroyed** — na každém `.subscribe()` pro prevenci memory leaků
- **New control flow** — `@if`, `@for`, `@switch` (žádné `*ngIf`, `*ngFor`)

## Styling

**Tailwind CSS v4** přes PostCSS (ne Sass!):

- Entry: `src/styles.css` s `@import 'tailwindcss'`
- PostCSS config: `postcss.config.js` s `@tailwindcss/postcss`
- Responsive: mobile-first (`px-3 sm:px-5`, `hidden sm:block`)

> **Pozor:** Tailwind v4 nefunguje v `.scss` souborech — Sass zpracuje `@import "tailwindcss"` před PostCSS a rozbije responsive utility třídy.

## Responsive Design

- **Header:** hamburger menu na mobilu (`md:hidden` / `hidden md:flex`)
- **Tabulky:** CSS Grid s fixními šířkami sloupců, skryté sloupce na mobilu
- **KPI karty:** `grid-cols-1 sm:grid-cols-3`
- **Filtry:** `grid-cols-2 sm:flex`
- Testováno na 375px (iPhone SE) a 415px

## Linting & Formátování

**ESLint** (`eslint.config.js`):
- `@angular-eslint` pravidla
- `eslint-config-prettier` pro kompatibilitu

**Prettier** (`.prettierrc`):
- Single quotes, trailing commas, 100 char width
- Angular HTML parser pro `.html` soubory

```bash
npm run lint      # Kontrola
npm run format    # Automatické formátování
```
