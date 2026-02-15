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

describe('Services API', () => {
  describe('GET /api/services', () => {
    it('returns list of services with group info', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, identifier: '123456789', label: 'Novak', type: 'phone', group_id: 1, group_name: 'IT' },
          { id: 2, identifier: 'DSL001', label: null, type: 'dsl', group_id: null, group_name: null },
          { id: 3, identifier: '555444333', label: 'Horak', type: 'phone', group_id: 2, group_name: 'HR' },
        ],
      });

      const res = await request(app).get('/api/services');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].group_name).toBe('IT');
      expect(res.body[1].group_name).toBeNull();
    });

    it('returns empty array when no services', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/services');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('PUT /api/services/:id', () => {
    it('updates service group assignment', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, identifier: '123456789' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ id: 1, identifier: '123456789', label: 'Novak', group_id: 2, group_name: 'HR' }],
        });

      const res = await request(app).put('/api/services/1').send({ group_id: 2 });
      expect(res.status).toBe(200);
      expect(res.body.group_name).toBe('HR');
    });

    it('updates service label', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, identifier: '123456789' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ id: 1, identifier: '123456789', label: 'Novak Milos', group_id: 1, group_name: 'IT' }],
        });

      const res = await request(app).put('/api/services/1').send({ label: 'Novak Milos' });
      expect(res.status).toBe(200);
      expect(res.body.label).toBe('Novak Milos');
    });

    it('unassigns service from group', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, identifier: '123456789' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ id: 1, identifier: '123456789', label: 'Novak', group_id: null, group_name: null }],
        });

      const res = await request(app).put('/api/services/1').send({ group_id: null });
      expect(res.status).toBe(200);
      expect(res.body.group_id).toBeNull();
    });

    it('returns 404 when service not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put('/api/services/999').send({ group_id: 1 });
      expect(res.status).toBe(404);
    });
  });
});
