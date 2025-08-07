export interface GenericErrorPayload {
  error: string;
}

export interface GenericSandboxMcpServerPayload {
  serverId: string;
}

export interface ChatTitleUpdatedPayload {
  chatId: number;
  title: string;
}

export interface SandboxPodmanRuntimeProgressPayload {
  percentage: number;
  message?: string;
}

export type SandboxMcpServerStartingPayload = GenericSandboxMcpServerPayload;
export type SandboxMcpServerStartedPayload = GenericSandboxMcpServerPayload;
export type SandboxMcpServerFailedPayload = GenericSandboxMcpServerPayload & GenericErrorPayload;

// WebSocket message types with discriminated union
export type WebSocketMessage =
  | { type: 'chat-title-updated'; payload: ChatTitleUpdatedPayload }
  | { type: 'sandbox-startup-started'; payload: {} }
  | { type: 'sandbox-startup-completed'; payload: {} }
  | { type: 'sandbox-startup-failed'; payload: GenericErrorPayload }
  | { type: 'sandbox-podman-runtime-progress'; payload: SandboxPodmanRuntimeProgressPayload }
  | { type: 'sandbox-base-image-fetch-started'; payload: {} }
  | { type: 'sandbox-base-image-fetch-completed'; payload: {} }
  | { type: 'sandbox-base-image-fetch-failed'; payload: GenericErrorPayload }
  | { type: 'sandbox-mcp-server-starting'; payload: SandboxMcpServerStartingPayload }
  | { type: 'sandbox-mcp-server-started'; payload: SandboxMcpServerStartedPayload }
  | { type: 'sandbox-mcp-server-failed'; payload: SandboxMcpServerFailedPayload };
