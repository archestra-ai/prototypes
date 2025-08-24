declare global {
  interface Window {
    electronAPI: {
      serverPort: number;
      websocketPort: number;
      ollamaPort: number;
      openExternal: (url: string) => Promise<void>;

      // Generic provider browser auth
      providerBrowserAuth: (provider: string) => Promise<Record<string, string>>;

      // Legacy Slack auth (backward compatibility)
      slackAuth: () => Promise<{
        slack_mcp_xoxc_token: string;
        slack_mcp_xoxd_token: string;
      }>;
    };
  }
}

export {};
