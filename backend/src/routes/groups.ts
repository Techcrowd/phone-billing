import { Router } from 'express';
import pool from '../db.js';
import type { ResultSetHeader } from 'mysql2';

const router = Router();

// GET /api/groups
router.get('/', async (req, res) => {
  const [groups] = await pool.query(`
    SELECT g.*,
      (SELECT COUNT(*) FROM services WHERE group_id = g.id) as service_count
    FROM \`groups\` g ORDER BY g.name
  `);

  const [services] = await pool.query(
    'SELECT * FROM services WHERE group_id IS NOT NULL ORDER BY identifier'
  );

  const result = (groups as any[]).map(g => ({
    ...g,
    services: (services as any[]).filter(s => s.group_id === g.id)
  }));

  res.json(result);
});

// POST /api/groups
router.post('/', async (req, res) => {
  const { name, note } = req.body;
  if (!name) return res.status(400).json({ error: 'Jmeno skupiny je povinne' });

  try {
    const [result] = await pool.query('INSERT INTO `groups` (name, note) VALUES (?, ?)', [name, note || null]);
    const [rows] = await pool.query('SELECT * FROM `groups` WHERE id = ?', [(result as ResultSetHeader).insertId]);
    res.status(201).json((rows as any[])[0]);
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Skupina s timto jmenem jiz existuje' });
    }
    throw e;
  }
});

// PUT /api/groups/:id
router.put('/:id', async (req, res) => {
  const { name, note } = req.body;
  const { id } = req.params;

  try {
    await pool.query('UPDATE `groups` SET name = COALESCE(?, name), note = ? WHERE id = ?',
      [name || null, note !== undefined ? note : null, id]);
    const [rows] = await pool.query('SELECT * FROM `groups` WHERE id = ?', [id]);
    if ((rows as any[]).length === 0) return res.status(404).json({ error: 'Skupina nenalezena' });
    res.json((rows as any[])[0]);
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Skupina s timto jmenem jiz existuje' });
    }
    throw e;
  }
});

// DELETE /api/groups/:id
router.delete('/:id', async (req, res) => {
  const [result] = await pool.query('DELETE FROM `groups` WHERE id = ?', [req.params.id]);
  if ((result as ResultSetHeader).affectedRows === 0) return res.status(404).json({ error: 'Skupina nenalezena' });
  res.json({ success: true });
});

export default router;
