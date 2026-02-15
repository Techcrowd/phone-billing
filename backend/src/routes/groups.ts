import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/groups
router.get('/', async (req, res) => {
  const { rows: groups } = await pool.query(`
    SELECT g.*,
      (SELECT COUNT(*)::int FROM services WHERE group_id = g.id) as service_count
    FROM "groups" g ORDER BY g.name
  `);

  const { rows: services } = await pool.query(
    'SELECT * FROM services WHERE group_id IS NOT NULL ORDER BY identifier'
  );

  const result = groups.map(g => ({
    ...g,
    services: services.filter(s => s.group_id === g.id)
  }));

  res.json(result);
});

// POST /api/groups
router.post('/', async (req, res) => {
  const { name, note } = req.body;
  if (!name) return res.status(400).json({ error: 'Jmeno skupiny je povinne' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO "groups" (name, note) VALUES ($1, $2) RETURNING *',
      [name, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) {
    if (e.code === '23505') {
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
    await pool.query(
      'UPDATE "groups" SET name = COALESCE($1, name), note = $2 WHERE id = $3',
      [name || null, note !== undefined ? note : null, id]
    );
    const { rows } = await pool.query('SELECT * FROM "groups" WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Skupina nenalezena' });
    res.json(rows[0]);
  } catch (e: any) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Skupina s timto jmenem jiz existuje' });
    }
    throw e;
  }
});

// DELETE /api/groups/:id
router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM "groups" WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Skupina nenalezena' });
  res.json({ success: true });
});

export default router;
