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

const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));

vi.mock('../db.js', () => ({
  default: mockPool,
  initDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../services/pdf-parser.js', () => ({
  parseTMobilePDF: mockParse,
}));

import request from 'supertest';
import { app } from '../server.js';

const PDF_BUFFER = Buffer.from('%PDF-1.4 fake pdf content');

function parseResult(overrides: Record<string, any> = {}) {
  return {
    success: true,
    items: [{ phoneNumber: '604111222', serviceName: 'Tarif', amountNoDph: 100, amountNonDph: 0, amountWithDph: 121 }],
    totalAmount: 121,
    totalNoDph: 100,
    dphRate: 0.21,
    period: '2026-07',
    periodText: '6.6. - 5.7.2026',
    docNumber: '2313523225',
    rawText: 'text',
    ...overrides,
  };
}

beforeEach(() => {
  resetMocks(mockPool, mockClient);
  mockParse.mockReset();
});

describe('POST /api/invoices/upload', () => {
  it('uploads invoice with doc_number and source', async () => {
    mockParse.mockResolvedValue(parseResult());
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE doc_number')) return { rows: [] };
      if (sql.startsWith('INSERT INTO invoices')) return { rows: [{ id: 42 }] };
      if (sql.startsWith('INSERT INTO services')) return { rows: [{ id: 7 }] };
      return { rows: [], rowCount: 0 };
    });
    mockPool.query.mockResolvedValue({ rows: [{ id: 42, period: '2026-07', doc_number: '2313523225', source: 'email' }] });

    const res = await request(app)
      .post('/api/invoices/upload')
      .field('source', 'email')
      .attach('file', PDF_BUFFER, 'Vyuctovani_56401952_2607.pdf');

    expect(res.status).toBe(201);
    expect(res.body.invoice.doc_number).toBe('2313523225');
    const insertCall = mockClient.query.mock.calls.find((c) => (c[0] as string).startsWith('INSERT INTO invoices'));
    expect(insertCall![1]).toContain('2313523225');
    expect(insertCall![1]).toContain('email');
  });

  it('rejects duplicate doc_number with 409', async () => {
    mockParse.mockResolvedValue(parseResult());
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE doc_number')) return { rows: [{ id: 1, period: '2026-07' }] };
      return { rows: [], rowCount: 0 };
    });

    const res = await request(app)
      .post('/api/invoices/upload')
      .attach('file', PDF_BUFFER, 'Vyuctovani_56401952_2607.pdf');

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('2313523225');
  });

  it('allows second invoice in the same period (different doc_number)', async () => {
    mockParse.mockResolvedValue(parseResult({ docNumber: '9999999999' }));
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE doc_number')) return { rows: [] };
      if (sql.startsWith('INSERT INTO invoices')) return { rows: [{ id: 43 }] };
      if (sql.startsWith('INSERT INTO services')) return { rows: [{ id: 7 }] };
      return { rows: [], rowCount: 0 };
    });
    mockPool.query.mockResolvedValue({ rows: [{ id: 43, period: '2026-07', doc_number: '9999999999', source: 'manual' }] });

    const res = await request(app)
      .post('/api/invoices/upload')
      .attach('file', PDF_BUFFER, 'Vyuctovani_11111111_2607.pdf');

    expect(res.status).toBe(201);
    expect(res.body.invoice.period).toBe('2026-07');
  });

  it('rejects non-PDF file', async () => {
    const res = await request(app)
      .post('/api/invoices/upload')
      .attach('file', Buffer.from('not a pdf'), 'file.pdf');

    expect(res.status).toBe(400);
  });
});
