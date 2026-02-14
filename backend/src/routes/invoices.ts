import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { parseTMobilePDF, type ParseResult } from '../services/pdf-parser.js';
import { aiParsePDF } from '../services/ai-parser.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
const IMPORT_DIR = process.env.IMPORT_DIR || path.join(os.homedir(), 'Downloads', 'tmobile');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    cb(null, `invoice-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Pouze PDF soubory jsou povoleny'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const router = Router();

function detectServiceType(identifier: string): string {
  if (identifier.startsWith('DSL')) return 'dsl';
  if (identifier.startsWith('TV')) return 'tv';
  if (identifier.startsWith('LIC')) return 'license';
  return 'phone';
}

async function findOrCreateService(conn: any, identifier: string, label: string | null): Promise<number> {
  const [rows] = await conn.query('SELECT id FROM services WHERE identifier = ?', [identifier]);
  if ((rows as any[]).length > 0) {
    const id = (rows as any[])[0].id;
    if (label) {
      await conn.query('UPDATE services SET label = ? WHERE id = ? AND (label IS NULL OR label != ?)', [label, id, label]);
    }
    return id;
  }
  const [result] = await conn.query(
    'INSERT INTO services (identifier, label, type) VALUES (?, ?, ?)',
    [identifier, label, detectServiceType(identifier)]
  );
  return (result as ResultSetHeader).insertId;
}

async function insertParsedItems(conn: any, invoiceId: number, items: ParseResult['items']) {
  for (const item of items) {
    const serviceId = await findOrCreateService(conn, item.phoneNumber, item.serviceName);
    await conn.query(
      'INSERT IGNORE INTO invoice_items (invoice_id, service_id, description, amount_with_vat, amount_without_vat, amount_vat_exempt) VALUES (?, ?, ?, ?, ?, ?)',
      [invoiceId, serviceId, item.serviceName, item.amountWithDph, item.amountNoDph, item.amountNonDph]
    );
  }
}

async function autoGeneratePayments(conn: any, invoiceId: number) {
  const [rows] = await conn.query(`
    SELECT s.group_id, SUM(ii.amount_with_vat) as total, SUM(ii.amount_without_vat) as total_no_vat
    FROM invoice_items ii
    JOIN services s ON s.id = ii.service_id
    WHERE ii.invoice_id = ? AND s.group_id IS NOT NULL
    GROUP BY s.group_id
  `, [invoiceId]);

  for (const gt of rows as any[]) {
    await conn.query(
      'INSERT INTO payments (invoice_id, group_id, amount, amount_without_vat) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount), amount_without_vat = VALUES(amount_without_vat)',
      [invoiceId, gt.group_id, gt.total, gt.total_no_vat]
    );
  }
}

async function parseWithFallback(filePath: string): Promise<ParseResult> {
  const result = await parseTMobilePDF(filePath);
  if (result.items.length === 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const aiResult = await aiParsePDF(result.rawText);
      if (aiResult.items.length > 0) {
        return { ...result, items: aiResult.items, success: true };
      }
    } catch (e) {
      console.error('AI parse fallback failed:', e);
    }
  }
  return result;
}

// POST /api/invoices/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Zadny soubor nebyl nahran' });

  const conn = await pool.getConnection();
  try {
    const parseResult = await parseWithFallback(req.file.path);
    const period = req.body.period || parseResult.period;
    if (!period) {
      return res.status(400).json({ error: 'Obdobi se nepodarilo detekovat. Zadejte ho rucne (YYYY-MM).' });
    }

    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO invoices (period, total_with_vat, total_without_vat, dph_rate, file_path) VALUES (?, ?, ?, ?, ?)',
      [period, parseResult.totalAmount, parseResult.totalNoDph, parseResult.dphRate, req.file.filename]
    );
    const invoiceId = (result as ResultSetHeader).insertId;
    await insertParsedItems(conn, invoiceId, parseResult.items);
    await autoGeneratePayments(conn, invoiceId);
    await conn.commit();

    const [inv] = await pool.query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    res.status(201).json({ invoice: (inv as any[])[0], parseResult: { success: parseResult.success, itemCount: parseResult.items.length } });
  } catch (e: any) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({ error: 'Faktura za toto obdobi jiz existuje' });
    }
    throw e;
  } finally {
    conn.release();
  }
});

// POST /api/invoices/import-downloads
router.post('/import-downloads', async (req, res) => {
  const folder = IMPORT_DIR;
  if (!fs.existsSync(folder)) {
    return res.status(400).json({ error: `Slozka ${folder} neexistuje` });
  }

  const files = fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith('.pdf')).sort();
  if (files.length === 0) {
    return res.json({ imported: [], totalNew: 0, totalSkipped: 0, totalErrors: 0 });
  }

  const results: any[] = [];

  for (const file of files) {
    const filePath = path.join(folder, file);
    const conn = await pool.getConnection();
    try {
      const parseResult = await parseWithFallback(filePath);
      if (!parseResult.period) {
        results.push({ file, error: 'Obdobi nedetekovano', skipped: true });
        conn.release();
        continue;
      }

      const destName = `invoice-${Date.now()}-${file.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      fs.copyFileSync(filePath, path.join(UPLOAD_DIR, destName));

      await conn.beginTransaction();
      const [result] = await conn.query(
        'INSERT INTO invoices (period, total_with_vat, total_without_vat, dph_rate, file_path) VALUES (?, ?, ?, ?, ?)',
        [parseResult.period, parseResult.totalAmount, parseResult.totalNoDph, parseResult.dphRate, destName]
      );
      const invoiceId = (result as ResultSetHeader).insertId;
      await insertParsedItems(conn, invoiceId, parseResult.items);
      await autoGeneratePayments(conn, invoiceId);
      await conn.commit();

      results.push({ file, period: parseResult.period, total: parseResult.totalAmount, items: parseResult.items.length, success: true });
    } catch (e: any) {
      await conn.rollback();
      if (e.code === 'ER_DUP_ENTRY') {
        results.push({ file, error: 'Obdobi jiz existuje', skipped: true });
      } else {
        results.push({ file, error: e.message });
      }
    } finally {
      conn.release();
    }
  }

  res.json({
    imported: results,
    totalNew: results.filter(r => r.success).length,
    totalSkipped: results.filter(r => r.skipped).length,
    totalErrors: results.filter(r => !r.success && !r.skipped).length
  });
});

// GET /api/invoices
router.get('/', async (req, res) => {
  const [invoices] = await pool.query(`
    SELECT i.*,
      (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) as item_count,
      (SELECT COUNT(*) FROM payments WHERE invoice_id = i.id AND is_paid = 1) as paid_groups,
      (SELECT COUNT(*) FROM payments WHERE invoice_id = i.id) as total_groups
    FROM invoices i
    ORDER BY i.period DESC
  `);
  res.json(invoices);
});

// GET /api/invoices/:id
router.get('/:id', async (req, res) => {
  const [invRows] = await pool.query('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
  const invoice = (invRows as any[])[0];
  if (!invoice) return res.status(404).json({ error: 'Faktura nenalezena' });

  const [items] = await pool.query(`
    SELECT ii.*, s.identifier, s.label as service_label, s.type as service_type, s.group_id, g.name as group_name
    FROM invoice_items ii
    JOIN services s ON s.id = ii.service_id
    LEFT JOIN \`groups\` g ON g.id = s.group_id
    WHERE ii.invoice_id = ?
    ORDER BY g.name, s.identifier
  `, [req.params.id]);

  const [payments] = await pool.query(`
    SELECT p.*, g.name as group_name
    FROM payments p
    JOIN \`groups\` g ON g.id = p.group_id
    WHERE p.invoice_id = ?
  `, [req.params.id]);

  const paymentMap = new Map((payments as any[]).map(p => [p.group_id, p]));

  const byGroup: Record<string, any> = {};
  for (const item of items as any[]) {
    const key = item.group_id ? String(item.group_id) : 'unassigned';
    if (!byGroup[key]) {
      const payment = item.group_id ? paymentMap.get(item.group_id) || null : null;
      byGroup[key] = {
        group_id: item.group_id,
        group_name: item.group_name || 'Neprirazeno',
        total_with_vat: 0,
        total_without_vat: 0,
        total_vat_exempt: 0,
        payment: payment ? { id: payment.id, is_paid: !!payment.is_paid, paid_at: payment.paid_at } : null,
        items: []
      };
    }
    byGroup[key].items.push({
      service_id: item.service_id,
      identifier: item.identifier,
      label: item.service_label,
      service_type: item.service_type,
      amount_with_vat: item.amount_with_vat,
      amount_without_vat: item.amount_without_vat,
      amount_vat_exempt: item.amount_vat_exempt
    });
    byGroup[key].total_with_vat += item.amount_with_vat;
    byGroup[key].total_without_vat += item.amount_without_vat;
    byGroup[key].total_vat_exempt += item.amount_vat_exempt;
  }

  const groups = Object.values(byGroup).sort((a: any, b: any) => {
    if (!a.group_id) return 1;
    if (!b.group_id) return -1;
    return a.group_name.localeCompare(b.group_name);
  });

  res.json({
    id: invoice.id,
    period: invoice.period,
    total_with_vat: invoice.total_with_vat,
    total_without_vat: invoice.total_without_vat,
    dph_rate: invoice.dph_rate,
    file_path: invoice.file_path,
    imported_at: invoice.imported_at,
    groups
  });
});

// DELETE /api/invoices/:id
router.delete('/:id', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
  const invoice = (rows as any[])[0];
  if (!invoice) return res.status(404).json({ error: 'Faktura nenalezena' });

  if (invoice.file_path) {
    const filePath = path.join(UPLOAD_DIR, invoice.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await pool.query('DELETE FROM invoices WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

export default router;
