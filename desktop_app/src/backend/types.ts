export type SupportedPlatform = 'linux' | 'mac' | 'win';
export type SupportedArchitecture = 'arm64' | 'x86_64';

/**
 * NOTE: `gvproxy` MUST be named explicitly `gvproxy`. It cannot have the version appended to it, this is because
 * `podman` internally is looking specifically for that binary naming convention. As of this writing, the version
 * of `gvproxy` that we are using is [`v0.8.6`](https://github.com/containers/gvisor-tap-vsock/releases/tag/v0.8.6)
 */
export type SupportedBinary = 'ollama-v0.9.6' | 'podman-remote-static-v5.5.2' | 'gvproxy';

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
