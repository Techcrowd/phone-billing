import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'phonebills',
  password: process.env.DB_PASSWORD || 'phonebills',
  database: process.env.DB_NAME || 'phonebills',
  waitForConnections: true,
  connectionLimit: 10,
});

export async function initDB(retries = 20, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await pool.getConnection();
      try {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS \`groups\` (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await conn.query(`
          CREATE TABLE IF NOT EXISTS services (
            id INT AUTO_INCREMENT PRIMARY KEY,
            identifier VARCHAR(255) NOT NULL UNIQUE,
            label VARCHAR(255),
            type VARCHAR(50) NOT NULL DEFAULT 'phone',
            group_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE SET NULL
          )
        `);
        await conn.query(`
          CREATE TABLE IF NOT EXISTS invoices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            period VARCHAR(7) NOT NULL UNIQUE,
            file_path VARCHAR(500),
            total_with_vat DOUBLE NOT NULL,
            total_without_vat DOUBLE NOT NULL DEFAULT 0,
            dph_rate DOUBLE NOT NULL DEFAULT 0.21,
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await conn.query(`
          CREATE TABLE IF NOT EXISTS invoice_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            invoice_id INT NOT NULL,
            service_id INT NOT NULL,
            description TEXT,
            amount_with_vat DOUBLE NOT NULL,
            amount_without_vat DOUBLE NOT NULL DEFAULT 0,
            amount_vat_exempt DOUBLE NOT NULL DEFAULT 0,
            UNIQUE(invoice_id, service_id),
            FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
            FOREIGN KEY (service_id) REFERENCES services(id)
          )
        `);
        await conn.query(`
          CREATE TABLE IF NOT EXISTS payments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            invoice_id INT NOT NULL,
            group_id INT NOT NULL,
            amount DOUBLE NOT NULL,
            amount_without_vat DOUBLE NOT NULL DEFAULT 0,
            is_paid TINYINT(1) NOT NULL DEFAULT 0,
            paid_at TIMESTAMP NULL,
            UNIQUE(invoice_id, group_id),
            FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
            FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
          )
        `);
        console.log('Database schema initialized');
      } finally {
        conn.release();
      }
      return;
    } catch (e: any) {
      if (i < retries - 1 && (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT' || e.code === 'ER_NOT_READY')) {
        console.log(`Waiting for MySQL... (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
}

export default pool;
