import { vi } from 'vitest';

process.env.VITEST = 'true';

export function resetMocks(mockPool: any, mockClient: any) {
  vi.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockPool.connect.mockResolvedValue(mockClient);
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
}
