import { Router } from 'express';
import pool from '../db.js';
import type { ResultSetHeader } from 'mysql2';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const router = Router();

// POST /api/payments/generate
router.post('/generate', async (req, res) => {
  const { invoice_id } = req.body;
  if (!invoice_id) return res.status(400).json({ error: 'invoice_id je povinne' });

  const [invRows] = await pool.query('SELECT * FROM invoices WHERE id = ?', [invoice_id]);
  if ((invRows as any[]).length === 0) return res.status(404).json({ error: 'Faktura nenalezena' });

  const [groupTotals] = await pool.query(`
    SELECT s.group_id, SUM(ii.amount_with_vat) as total, SUM(ii.amount_without_vat) as total_no_vat
    FROM invoice_items ii
    JOIN services s ON s.id = ii.service_id
    WHERE ii.invoice_id = ? AND s.group_id IS NOT NULL
    GROUP BY s.group_id
  `, [invoice_id]);

  if ((groupTotals as any[]).length === 0) {
    return res.status(400).json({ error: 'Zadna cisla nejsou prirazena ke skupinam' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const gt of groupTotals as any[]) {
      await conn.query(
        'INSERT INTO payments (invoice_id, group_id, amount, amount_without_vat) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount), amount_without_vat = VALUES(amount_without_vat)',
        [invoice_id, gt.group_id, gt.total, gt.total_no_vat]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  const [payments] = await pool.query(`
    SELECT p.*, g.name as group_name
    FROM payments p
    JOIN \`groups\` g ON g.id = p.group_id
    WHERE p.invoice_id = ?
    ORDER BY g.name
  `, [invoice_id]);

  res.json(payments);
});

// GET /api/payments
router.get('/', async (req, res) => {
  const { period, group_id } = req.query;
  let sql = `
    SELECT p.*, g.name as group_name, i.period
    FROM payments p
    JOIN \`groups\` g ON g.id = p.group_id
    JOIN invoices i ON i.id = p.invoice_id
  `;
  const conditions: string[] = [];
  const params: any[] = [];

  if (period) { conditions.push('i.period = ?'); params.push(period); }
  if (group_id) { conditions.push('p.group_id = ?'); params.push(group_id); }

  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY i.period DESC, g.name';

  const [payments] = await pool.query(sql, params);
  res.json(payments);
});

// GET /api/payments/summary
router.get('/summary', async (req, res) => {
  const { period } = req.query;
  let invoiceFilter = '';
  const params: any[] = [];

  if (period) {
    invoiceFilter = 'AND i.period = ?';
    params.push(period);
  } else {
    invoiceFilter = 'AND i.period = (SELECT MAX(period) FROM invoices)';
  }

  const [summary] = await pool.query(`
    SELECT g.id as group_id, g.name as group_name, i.period,
      p.amount, p.amount_without_vat, p.is_paid, p.paid_at, p.id as payment_id
    FROM payments p
    JOIN \`groups\` g ON g.id = p.group_id
    JOIN invoices i ON i.id = p.invoice_id
    WHERE 1=1 ${invoiceFilter}
    ORDER BY g.name
  `, params);

  const rows = summary as any[];
  const totalDue = rows.reduce((sum, s) => sum + s.amount, 0);
  const totalDueNoVat = rows.reduce((sum, s) => sum + s.amount_without_vat, 0);
  const paidRows = rows.filter(s => s.is_paid);
  const totalPaid = paidRows.reduce((sum, s) => sum + s.amount, 0);
  const totalPaidNoVat = paidRows.reduce((sum, s) => sum + s.amount_without_vat, 0);

  res.json({
    period: rows[0]?.period || period || null,
    groups: rows,
    totalDue,
    totalDueNoVat,
    totalPaid,
    totalPaidNoVat,
    totalUnpaid: totalDue - totalPaid,
    totalUnpaidNoVat: totalDueNoVat - totalPaidNoVat
  });
});

// GET /api/payments/export — PDF export unpaid only, with QR code + service breakdown
router.get('/export', async (req, res) => {
  const { period, group_id } = req.query;
  let sql = `
    SELECT p.id as payment_id, p.amount, p.amount_without_vat,
           g.id as group_id, g.name as group_name, i.id as invoice_id, i.period
    FROM payments p
    JOIN \`groups\` g ON g.id = p.group_id
    JOIN invoices i ON i.id = p.invoice_id
    WHERE p.is_paid = 0
  `;
  const params: any[] = [];

  if (period) { sql += ' AND i.period = ?'; params.push(period); }
  if (group_id) { sql += ' AND p.group_id = ?'; params.push(group_id); }

  sql += ' ORDER BY i.period DESC, g.name';

  const [rows] = await pool.query(sql, params);
  const payments = rows as any[];

  if (payments.length === 0) {
    return res.status(404).json({ error: 'Zadne nezaplacene platby k exportu' });
  }

  // Load service items for each payment (invoice+group combo)
  const invoiceIds = [...new Set(payments.map((p: any) => p.invoice_id))];
  const [itemRows] = await pool.query(`
    SELECT ii.invoice_id, s.group_id, s.identifier, s.label, s.type,
           ii.amount_with_vat, ii.amount_without_vat
    FROM invoice_items ii
    JOIN services s ON s.id = ii.service_id
    WHERE ii.invoice_id IN (${invoiceIds.map(() => '?').join(',')}) AND s.group_id IS NOT NULL
    ORDER BY s.identifier
  `, invoiceIds);
  const items = itemRows as any[];

  // Index items by invoice_id+group_id
  const itemMap = new Map<string, any[]>();
  for (const it of items) {
    const key = `${it.invoice_id}_${it.group_id}`;
    if (!itemMap.has(key)) itemMap.set(key, []);
    itemMap.get(key)!.push(it);
  }

  const total = payments.reduce((s: number, p: any) => s + p.amount, 0);
  const totalNoVat = payments.reduce((s: number, p: any) => s + p.amount_without_vat, 0);

  // SPAYD QR code
  const iban = 'CZ3908000000002112251153';
  const msg = period ? `Vyuctovani telefonu ${period}` : 'Vyuctovani telefonu';
  const spayd = `SPD*1.0*ACC:${iban}*AM:${total.toFixed(2)}*CC:CZK*MSG:${msg}`;
  const qrDataUrl = await QRCode.toDataURL(spayd, { width: 200, margin: 1 });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  // Helpers
  const czk = (n: number) => Math.round(n).toLocaleString('cs-CZ') + ' Kč';
  const months = ['', 'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
  const fmtPeriod = (p: string) => {
    const [y, m] = p.split('-');
    return `${months[parseInt(m)]} ${y}`;
  };
  const fmtId = (id: string) => /^\d{9}$/.test(id) ? `${id.slice(0,3)} ${id.slice(3,6)} ${id.slice(6)}` : id;

  // Font path
  const fontRegular = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const fontBold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

  // Build PDF
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  const today = new Date().toISOString().slice(0, 10);
  const groupName = group_id ? payments[0]?.group_name?.replace(/\s+/g, '-') : null;
  const filenameParts = ['vyuctovani', today];
  if (period) filenameParts.push(period as string);
  if (groupName) filenameParts.push(groupName);
  const filename = filenameParts.join('_') + '.pdf';
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  doc.pipe(res);

  doc.registerFont('Main', fontRegular);
  doc.registerFont('MainBold', fontBold);
  doc.font('Main');

  // Header
  doc.fontSize(20).fillColor('#111827').text('Vyúčtování telefonu', 50, 50);
  const subtitle = period ? fmtPeriod(period as string) : 'Všechna období';
  doc.fontSize(11).fillColor('#6b7280').text(subtitle, 50, 75);
  doc.fontSize(9).fillColor('#9ca3af').text(`Vygenerováno: ${new Date().toLocaleDateString('cs-CZ')}`, 50, 92);

  // Summary box
  const boxY = 120;
  doc.roundedRect(50, boxY, 495, 55, 6).fill('#fef2f2').stroke('#fecaca');
  doc.font('Main').fontSize(9).fillColor('#ef4444').text('Nezaplaceno celkem', 70, boxY + 10);
  doc.font('MainBold').fontSize(18).fillColor('#dc2626').text(czk(total), 70, boxY + 24);
  doc.font('Main').fontSize(8).fillColor('#f87171').text(czk(totalNoVat) + ' bez DPH', 70, boxY + 46);
  doc.font('Main').fontSize(9).fillColor('#9ca3af').text(`${payments.length} nezaplacených položek`, 350, boxY + 28);

  let y = 195;

  // Render each payment group with service breakdown
  for (let idx = 0; idx < payments.length; idx++) {
    const p = payments[idx];
    const svcItems = itemMap.get(`${p.invoice_id}_${p.group_id}`) || [];
    const blockHeight = 30 + svcItems.length * 16 + 20; // header + items + subtotal

    if (y + blockHeight > 740) {
      doc.addPage();
      y = 50;
    }

    // Group header bar
    doc.roundedRect(50, y, 495, 24, 4).fill('#f1f5f9');
    doc.font('MainBold').fontSize(10).fillColor('#1e293b');
    doc.text(p.group_name, 62, y + 7);
    doc.font('Main').fontSize(8).fillColor('#94a3b8');
    doc.text(fmtPeriod(p.period), 200, y + 8);
    doc.font('MainBold').fontSize(10).fillColor('#dc2626');
    doc.text(czk(p.amount), 410, y + 7, { width: 125, align: 'right' });
    y += 30;

    // Service items
    for (const svc of svcItems) {
      if (y > 750) {
        doc.addPage();
        y = 50;
      }

      const label = svc.label ? `${fmtId(svc.identifier)} — ${svc.label}` : fmtId(svc.identifier);
      doc.font('Main').fontSize(8).fillColor('#64748b');
      doc.text(label, 72, y, { width: 280 });
      doc.fillColor('#94a3b8');
      doc.text(czk(svc.amount_without_vat), 350, y, { width: 70, align: 'right' });
      doc.fillColor('#475569');
      doc.text(czk(svc.amount_with_vat), 430, y, { width: 105, align: 'right' });
      y += 16;
    }

    // Subtotal line
    doc.moveTo(62, y).lineTo(535, y).strokeColor('#e2e8f0').lineWidth(0.3).stroke();
    y += 6;
    doc.font('Main').fontSize(7).fillColor('#94a3b8');
    doc.text(`${svcItems.length} služeb`, 72, y);
    doc.text(czk(p.amount_without_vat) + ' bez DPH', 350, y, { width: 70, align: 'right' });
    doc.font('MainBold').fontSize(8).fillColor('#334155');
    doc.text(czk(p.amount) + ' s DPH', 430, y, { width: 105, align: 'right' });
    y += 20;
  }

  // Grand total
  y += 4;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#cbd5e1').lineWidth(1).stroke();
  y += 12;
  doc.font('MainBold').fontSize(12).fillColor('#111827');
  doc.text('Celkem k úhradě', 62, y);
  doc.fillColor('#94a3b8').fontSize(9);
  doc.text(czk(totalNoVat) + ' bez DPH', 300, y + 2, { width: 120, align: 'right' });
  doc.fillColor('#dc2626').fontSize(12);
  doc.text(czk(total), 430, y, { width: 105, align: 'right' });

  // QR section
  y += 40;
  if (y > 580) {
    doc.addPage();
    y = 50;
  }

  doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  y += 20;

  doc.font('MainBold').fontSize(13).fillColor('#111827').text('Platba QR kódem', 50, y);
  y += 24;
  doc.font('Main').fontSize(9).fillColor('#6b7280').text('Účet: 2112251153/0800', 50, y);
  y += 15;
  doc.text('Částka: ' + czk(total), 50, y);
  y += 15;
  doc.text('Zpráva: ' + msg, 50, y);
  y += 26;
  doc.image(qrBuffer, 50, y, { width: 140 });
  y += 150;
  doc.font('Main').fontSize(7).fillColor('#9ca3af').text('Naskenujte QR kód v bankovní aplikaci', 50, y);

  doc.end();
});

// PUT /api/payments/:id
router.put('/:id', async (req, res) => {
  const { is_paid } = req.body;
  const { id } = req.params;

  const [rows] = await pool.query('SELECT * FROM payments WHERE id = ?', [id]);
  if ((rows as any[]).length === 0) return res.status(404).json({ error: 'Platba nenalezena' });

  const paidAt = is_paid ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
  await pool.query('UPDATE payments SET is_paid = ?, paid_at = ? WHERE id = ?', [is_paid ? 1 : 0, paidAt, id]);

  const [updated] = await pool.query(`
    SELECT p.*, g.name as group_name, i.period
    FROM payments p
    JOIN \`groups\` g ON g.id = p.group_id
    JOIN invoices i ON i.id = p.invoice_id
    WHERE p.id = ?
  `, [id]);

  res.json((updated as any[])[0]);
});

export default router;
