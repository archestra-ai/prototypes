export enum ExternalMcpClientName {
  ClaudeDesktop = 'claude',
  Cursor = 'cursor',
  VSCode = 'vscode',
}

export interface ExternalMcpClient {
  client_name: string;
  created_at: string;
  updated_at: string;
}
