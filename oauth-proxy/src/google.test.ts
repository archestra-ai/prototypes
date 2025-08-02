import { googleProviderHandler } from '@/google';

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/oauth/authorize?state=test'),
        getToken: vi.fn().mockResolvedValue({
          tokens: {
            access_token: 'mock_access_token',
            refresh_token: 'mock_refresh_token',
            expiry_date: Date.now() + 3600000,
            token_type: 'Bearer',
            scope: 'email openid',
          },
        }),
      })),
    },
  },
}));

describe('Google OAuth Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateAuthUrl', () => {
    it('should generate a valid auth URL', async () => {
      const state = 'test-state';
      const scopes = ['email', 'openid'];

      const authUrl = await googleProviderHandler.generateAuthUrl(state, scopes);

      expect(authUrl).toContain('https://accounts.google.com');
      expect(authUrl).toContain('state=test');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange code for tokens successfully', async () => {
      const code = 'test-auth-code';

      const tokens = await googleProviderHandler.exchangeCodeForTokens(code);

      expect(tokens).toEqual({
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expiry_date: expect.any(Number),
        token_type: 'Bearer',
        scope: 'email openid',
      });
    });
  });
});
