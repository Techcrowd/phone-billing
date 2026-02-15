import { Router } from 'express';
import { z } from 'zod';
import pool from '../db.js';

// FINDING-009: Input validation schemas
const createGroupSchema = z.object({
  name: z.string().min(1).max(255),
  note: z.string().max(1000).optional()
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  note: z.string().max(1000).nullable().optional()
});

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
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { name, note } = parsed.data;

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
  const parsed = updateGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { name, note } = parsed.data;
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
