import { Request, Response } from 'express';

import handlers from '@/v1/handlers';

// Mock the logger
vi.mock('@/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock the google provider
vi.mock('@/google', () => ({
  default: {
    generateAuthUrl: vi.fn().mockResolvedValue('https://accounts.google.com/oauth/authorize?...'),
    exchangeCodeForTokens: vi.fn().mockResolvedValue({
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      expiry_date: Date.now() + 3600000,
    }),
  },
}));

describe('v1 handlers', () => {
  let mockReq: Partial<Request<any>>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      params: {},
      query: {},
    };
    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
      redirect: vi.fn(),
      sendFile: vi.fn(),
    };
    vi.clearAllMocks();
  });

  describe('authService', () => {
    it('should generate auth URL for Gmail', async () => {
      mockReq.params = { provider: 'google' };
      mockReq.query = { userId: 'test-user', mcpCatalogConnectorId: 'gmail' };

      await handlers.authProvider(mockReq as Request<{ provider: string }>, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        auth_url: expect.stringContaining('https://accounts.google.com'),
        state: expect.any(String),
      });
    });

    it('should handle errors gracefully', async () => {
      mockReq.params = { provider: 'invalid-provider' };
      mockReq.query = { mcpCatalogConnectorId: 'gmail' };

      await handlers.authProvider(mockReq as Request<{ provider: string }>, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('Unsupported OAuth provider'),
      });
    });
  });

  describe('oauthCallback', () => {
    it('should redirect with error when code is missing', async () => {
      mockReq.params = { provider: 'google' };
      mockReq.query = { state: 'test-state', mcpCatalogConnectorId: 'gmail' };

      await handlers.oauthCallback(mockReq as Request<{ provider: string }>, mockRes as Response);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=Missing%20authorization%20code%20or%20state')
      );
    });

    it('should redirect with error when state is missing', async () => {
      mockReq.params = { provider: 'google' };
      mockReq.query = { code: 'test-code', mcpCatalogConnectorId: 'gmail' };

      await handlers.oauthCallback(mockReq as Request<{ provider: string }>, mockRes as Response);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=Missing%20authorization%20code%20or%20state')
      );
    });
  });

  describe('getIndex', () => {
    it('should send the index.html file', () => {
      handlers.getIndex(mockReq as Request, mockRes as Response);

      expect(mockRes.sendFile).toHaveBeenCalledWith(expect.stringContaining('index.html'));
    });
  });
});
