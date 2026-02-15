import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetMocks } from './setup.js';

const { mockPool, mockClient } = vi.hoisted(() => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
  };
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn().mockResolvedValue(mockClient),
  };
  return { mockPool, mockClient };
});

vi.mock('../db.js', () => ({
  default: mockPool,
  initDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

import request from 'supertest';
import { app } from '../server.js';

beforeEach(() => resetMocks(mockPool, mockClient));

describe('Groups API', () => {
  describe('GET /api/groups', () => {
    it('returns groups with nested services', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'IT', service_count: 2 },
            { id: 2, name: 'HR', service_count: 0 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 10, identifier: '123456789', group_id: 1, label: 'Novak' },
            { id: 11, identifier: '987654321', group_id: 1, label: 'Horak' },
          ],
        });

      const res = await request(app).get('/api/groups');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('IT');
      expect(res.body[0].services).toHaveLength(2);
      expect(res.body[1].services).toHaveLength(0);
    });

    it('returns empty array when no groups', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/groups');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/groups', () => {
    it('creates a new group', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Marketing', note: null, created_at: '2025-01-01' }],
      });

      const res = await request(app).post('/api/groups').send({ name: 'Marketing' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Marketing');
    });

    it('creates a group with note', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 2, name: 'HR', note: 'Human Resources', created_at: '2025-01-01' }],
      });

      const res = await request(app).post('/api/groups').send({ name: 'HR', note: 'Human Resources' });
      expect(res.status).toBe(201);
      expect(res.body.note).toBe('Human Resources');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app).post('/api/groups').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 409 on duplicate name', async () => {
      mockPool.query.mockRejectedValueOnce({ code: '23505' });

      const res = await request(app).post('/api/groups').send({ name: 'IT' });
      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/groups/:id', () => {
    it('updates a group', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'IT Updated', note: 'new note' }] });

      const res = await request(app).put('/api/groups/1').send({ name: 'IT Updated', note: 'new note' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('IT Updated');
    });

    it('returns 404 when group not found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put('/api/groups/999').send({ name: 'X' });
      expect(res.status).toBe(404);
    });

    it('returns 409 on duplicate name', async () => {
      mockPool.query.mockRejectedValueOnce({ code: '23505' });

      const res = await request(app).put('/api/groups/1').send({ name: 'HR' });
      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/groups/:id', () => {
    it('deletes a group', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app).delete('/api/groups/1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 when group not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const res = await request(app).delete('/api/groups/999');
      expect(res.status).toBe(404);
    });
  });
});
