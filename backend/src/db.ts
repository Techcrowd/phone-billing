import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://phonebills:phonebills@localhost:5432/phonebills',
});

export async function initDB() {
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
      period TEXT NOT NULL UNIQUE,
      file_path TEXT,
      total_with_vat DOUBLE PRECISION NOT NULL,
      total_without_vat DOUBLE PRECISION NOT NULL DEFAULT 0,
      dph_rate DOUBLE PRECISION NOT NULL DEFAULT 0.21,
      imported_at TIMESTAMP DEFAULT NOW()
    )
  `);
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
}

export default pool;
