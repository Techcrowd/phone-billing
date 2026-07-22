import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL environment variable');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

export async function initDB(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('Connected to PostgreSQL');
      break;
    } catch (e: any) {
      if (i < retries - 1) {
        console.log(`Waiting for PostgreSQL... (${i + 1}/${retries}): ${e.message}`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "groups" (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      identifier TEXT NOT NULL UNIQUE,
      label TEXT,
      type TEXT NOT NULL DEFAULT 'phone',
      group_id INTEGER REFERENCES "groups"(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      period TEXT NOT NULL,
      file_path TEXT,
      total_with_vat DOUBLE PRECISION NOT NULL,
      total_without_vat DOUBLE PRECISION NOT NULL DEFAULT 0,
      dph_rate DOUBLE PRECISION NOT NULL DEFAULT 0.21,
      doc_number TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      imported_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Migrace: více vyúčtování pod jedním obdobím, dedup podle čísla daňového dokladu
  await pool.query(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_period_key`);
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS doc_number TEXT`);
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS invoices_doc_number_key ON invoices(doc_number) WHERE doc_number IS NOT NULL`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id),
      description TEXT,
      amount_with_vat DOUBLE PRECISION NOT NULL,
      amount_without_vat DOUBLE PRECISION NOT NULL DEFAULT 0,
      amount_vat_exempt DOUBLE PRECISION NOT NULL DEFAULT 0,
      UNIQUE(invoice_id, service_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES "groups"(id) ON DELETE CASCADE,
      amount DOUBLE PRECISION NOT NULL,
      amount_without_vat DOUBLE PRECISION NOT NULL DEFAULT 0,
      is_paid BOOLEAN NOT NULL DEFAULT FALSE,
      paid_at TIMESTAMP,
      UNIQUE(invoice_id, group_id)
    )
  `);
  console.log('Database schema initialized');
  await backfillDocNumbers();
}

// Jednorázový backfill: doplní doc_number ke starším fakturám z uložených PDF
async function backfillDocNumbers() {
  const { rows } = await pool.query(
    `SELECT id, file_path FROM invoices WHERE doc_number IS NULL AND file_path IS NOT NULL`
  );
  if (rows.length === 0) return;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
  const { parseTMobilePDF } = await import('./services/pdf-parser.js');

  for (const inv of rows) {
    const filePath = path.join(uploadDir, path.basename(inv.file_path));
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = await parseTMobilePDF(filePath);
      if (parsed.docNumber) {
        await pool.query('UPDATE invoices SET doc_number = $1 WHERE id = $2', [parsed.docNumber, inv.id]);
        console.log(`Backfill doc_number: invoice ${inv.id} → ${parsed.docNumber}`);
      }
    } catch (e: any) {
      // Duplicitní doklad nebo nečitelné PDF — necháme NULL
      console.warn(`Backfill doc_number selhal pro invoice ${inv.id}: ${e.message}`);
    }
  }
}

export default pool;
