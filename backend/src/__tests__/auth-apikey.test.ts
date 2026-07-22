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

process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.ALLOWED_EMAIL = 'test@example.com';
process.env.AUTOMATION_API_KEY = 'secret-automation-key';

import request from 'supertest';
import { app } from '../server.js';

beforeEach(() => resetMocks(mockPool, mockClient));

describe('API key auth', () => {
  it('allows request with valid X-Api-Key', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/invoices').set('X-Api-Key', 'secret-automation-key');
    expect(res.status).toBe(200);
  });

  it('rejects invalid X-Api-Key', async () => {
    const res = await request(app).get('/api/invoices').set('X-Api-Key', 'wrong-key');
    expect(res.status).toBe(401);
  });

  it('rejects request without any auth', async () => {
    const res = await request(app).get('/api/invoices');
    expect(res.status).toBe(401);
  });
});
