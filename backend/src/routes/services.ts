import { Router } from 'express';
import { z } from 'zod';
import pool from '../db.js';

// FINDING-009: Input validation schema
const updateServiceSchema = z.object({
  group_id: z.number().int().positive().nullable().optional(),
  label: z.string().max(255).nullable().optional()
});

const router = Router();

// GET /api/services
router.get('/', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, g.name as group_name
    FROM services s
    LEFT JOIN "groups" g ON g.id = s.group_id
    ORDER BY s.type, s.identifier
  `);
  res.json(rows);
});

// PUT /api/services/:id
router.put('/:id', async (req, res) => {
  const parsed = updateServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { group_id, label } = parsed.data;
  const { id } = req.params;

  const { rows: existing } = await pool.query('SELECT * FROM services WHERE id = $1', [id]);
  if (existing.length === 0) return res.status(404).json({ error: 'Sluzba nenalezena' });

  const updates: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (group_id !== undefined) {
    updates.push(`group_id = $${paramIdx++}`);
    params.push(group_id === null ? null : group_id);
  }
  if (label !== undefined) {
    updates.push(`label = $${paramIdx++}`);
    params.push(label || null);
  }

  if (updates.length > 0) {
    params.push(id);
    await pool.query(`UPDATE services SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
  }

  const { rows } = await pool.query(`
    SELECT s.*, g.name as group_name
    FROM services s
    LEFT JOIN "groups" g ON g.id = s.group_id
    WHERE s.id = $1
  `, [id]);

  res.json(rows[0]);
});

export default router;
