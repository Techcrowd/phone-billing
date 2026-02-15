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

describe('Invoices API', () => {
  describe('GET /api/invoices', () => {
    it('returns list of invoices with metadata', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            period: '2025-01',
            total_with_vat: 5000,
            total_without_vat: 4132,
            item_count: 10,
            paid_groups: 2,
            total_groups: 3,
          },
          {
            id: 2,
            period: '2025-02',
            total_with_vat: 4800,
            total_without_vat: 3966,
            item_count: 9,
            paid_groups: 0,
            total_groups: 3,
          },
        ],
      });

      const res = await request(app).get('/api/invoices');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].item_count).toBe(10);
      expect(res.body[0].paid_groups).toBe(2);
    });

    it('returns empty array when no invoices', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/invoices');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/invoices/:id', () => {
    it('returns invoice detail with grouped items', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1, period: '2025-01', total_with_vat: 5000, total_without_vat: 4132,
            dph_rate: 0.21, file_path: null, imported_at: '2025-01-15',
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1, service_id: 1, identifier: '123456789', service_label: 'Novak',
              service_type: 'phone', group_id: 1, group_name: 'IT',
              amount_with_vat: 500, amount_without_vat: 413, amount_vat_exempt: 0,
            },
            {
              id: 2, service_id: 2, identifier: '987654321', service_label: 'Horak',
              service_type: 'phone', group_id: 1, group_name: 'IT',
              amount_with_vat: 300, amount_without_vat: 248, amount_vat_exempt: 0,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 1, group_id: 1, group_name: 'IT', is_paid: false, paid_at: null,
            amount: 800, amount_without_vat: 661,
          }],
        });

      const res = await request(app).get('/api/invoices/1');
      expect(res.status).toBe(200);
      expect(res.body.period).toBe('2025-01');
      expect(res.body.groups).toHaveLength(1);
      expect(res.body.groups[0].group_name).toBe('IT');
      expect(res.body.groups[0].items).toHaveLength(2);
    });

    it('returns 404 for non-existent invoice', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/invoices/999');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/invoices/:id', () => {
    it('deletes an invoice without file', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, file_path: null }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app).delete('/api/invoices/1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('deletes an invoice with file cleanup', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, file_path: 'invoice-test.pdf' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app).delete('/api/invoices/1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 for non-existent invoice', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete('/api/invoices/999');
      expect(res.status).toBe(404);
    });
  });
});
