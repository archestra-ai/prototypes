export const app = {
  isPackaged: false,
  getPath: vi.fn((name: string) => {
    if (name === 'userData') {
      return '/tmp/test-user-data';
    }
    return '/tmp';
  }),
  getAppPath: vi.fn(() => '/test/app/path'),
  getName: vi.fn(() => 'test-app'),
  getVersion: vi.fn(() => '1.0.0'),
};
