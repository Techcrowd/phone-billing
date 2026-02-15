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

describe('Payments API', () => {
  describe('POST /api/payments/generate', () => {
    it('generates payments from invoice items', async () => {
      // 1. invoice exists
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        // 2. group totals
        .mockResolvedValueOnce({
          rows: [
            { group_id: 1, total: 500, total_no_vat: 413 },
            { group_id: 2, total: 300, total_no_vat: 248 },
          ],
        })
        // 3. final result
        .mockResolvedValueOnce({
          rows: [
            { id: 1, group_name: 'IT', amount: 500, amount_without_vat: 413, is_paid: false },
            { id: 2, group_name: 'HR', amount: 300, amount_without_vat: 248, is_paid: false },
          ],
        });

      // client queries: BEGIN, INSERT x2, COMMIT
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const res = await request(app).post('/api/payments/generate').send({ invoice_id: 1 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('returns 400 without invoice_id', async () => {
      const res = await request(app).post('/api/payments/generate').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('invoice_id');
    });

    it('returns 404 when invoice not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post('/api/payments/generate').send({ invoice_id: 999 });
      expect(res.status).toBe(404);
    });

    it('returns 400 when no groups assigned', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post('/api/payments/generate').send({ invoice_id: 1 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/payments', () => {
    it('returns payments list', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, group_name: 'IT', period: '2025-01', amount: 500, is_paid: false },
          { id: 2, group_name: 'HR', period: '2025-01', amount: 300, is_paid: true },
        ],
      });

      const res = await request(app).get('/api/payments');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('filters by period and group_id', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/payments?period=2025-01&group_id=1');
      expect(res.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('i.period = $'),
        expect.arrayContaining(['2025-01', '1']),
      );
    });
  });

  describe('GET /api/payments/summary', () => {
    it('returns aggregated summary', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { group_id: 1, group_name: 'IT', period: '2025-01', amount: 500, amount_without_vat: 413, is_paid: true, paid_at: '2025-02-01', payment_id: 1 },
          { group_id: 2, group_name: 'HR', period: '2025-01', amount: 300, amount_without_vat: 248, is_paid: false, paid_at: null, payment_id: 2 },
        ],
      });

      const res = await request(app).get('/api/payments/summary');
      expect(res.status).toBe(200);
      expect(res.body.totalDue).toBe(800);
      expect(res.body.totalPaid).toBe(500);
      expect(res.body.totalUnpaid).toBe(300);
      expect(res.body.groups).toHaveLength(2);
    });

    it('returns summary for specific period', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ group_id: 1, group_name: 'IT', period: '2025-03', amount: 400, amount_without_vat: 330, is_paid: false, paid_at: null, payment_id: 5 }],
      });

      const res = await request(app).get('/api/payments/summary?period=2025-03');
      expect(res.status).toBe(200);
      expect(res.body.period).toBe('2025-03');
      expect(res.body.totalDue).toBe(400);
    });

    it('returns empty summary when no payments', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/payments/summary');
      expect(res.status).toBe(200);
      expect(res.body.totalDue).toBe(0);
      expect(res.body.totalPaid).toBe(0);
    });
  });

  describe('PUT /api/payments/:id', () => {
    it('marks payment as paid', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, is_paid: false }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ id: 1, is_paid: true, paid_at: '2025-02-01 10:00:00', group_name: 'IT', period: '2025-01' }],
        });

      const res = await request(app).put('/api/payments/1').send({ is_paid: true });
      expect(res.status).toBe(200);
      expect(res.body.is_paid).toBe(true);
      expect(res.body.paid_at).toBeDefined();
    });

    it('marks payment as unpaid', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, is_paid: true }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ id: 1, is_paid: false, paid_at: null, group_name: 'IT', period: '2025-01' }],
        });

      const res = await request(app).put('/api/payments/1').send({ is_paid: false });
      expect(res.status).toBe(200);
      expect(res.body.is_paid).toBe(false);
    });

    it('returns 404 when payment not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put('/api/payments/999').send({ is_paid: true });
      expect(res.status).toBe(404);
    });
  });
});
