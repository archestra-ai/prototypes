export type GoogleService =
  | 'gmail'
  | 'google-drive'
  | 'google-calendar'
  | 'google-docs'
  | 'google-sheets'
  | 'google-slides'
  | 'google-forms'
  | 'google-tasks'
  | 'google-chat';

export type OAuthService = GoogleService;

export interface AuthState {
  userId: string;
  service: OAuthService;
  timestamp: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
}

export interface ServiceHandler {
  generateAuthUrl(state: string, scopes: string[]): Promise<string>;
  exchangeCodeForTokens(code: string): Promise<TokenResponse>;
}
