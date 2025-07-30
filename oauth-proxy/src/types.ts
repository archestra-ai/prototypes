export type GoogleMCPCatalogConnectorId =
  | 'gmail'
  | 'google-drive'
  | 'google-calendar'
  | 'google-docs'
  | 'google-sheets'
  | 'google-slides'
  | 'google-forms'
  | 'google-tasks'
  | 'google-chat';

export type MCPCatalogConnectorId = GoogleMCPCatalogConnectorId;

export interface AuthState {
  userId: string;
  mcpCatalogConnectorId: MCPCatalogConnectorId;
  timestamp: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
}

export interface ProviderHandler {
  generateAuthUrl(mcpCatalogConnectorId: MCPCatalogConnectorId, state: string, scopes: string[]): Promise<string>;
  exchangeCodeForTokens(code: string): Promise<TokenResponse>;
}
