export const createServer = vi.fn(() => ({
  listen: vi.fn((port, host, callback) => {
    if (callback) callback();
  }),
  address: vi.fn(() => ({ port: 12345 })),
  close: vi.fn((callback) => {
    if (callback) callback();
  }),
  on: vi.fn(),
}));
