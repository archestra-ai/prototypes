/**
 * This file configures the API client with the gateway base URL
 * This file is NOT generated and will not be overwritten by codegen
 */
import { ARCHESTRA_SERVER_API_URL } from '@/consts';

import { createClient } from './api/client/client';

// Create a configured client with the gateway URL
export const apiClient = createClient({
  baseUrl: ARCHESTRA_SERVER_API_URL,
});

// Re-export everything from the generated API
export * from './api';

// Re-export custom types
export type { Chat, ChatWithMessages, ToolCall, ChatMessage } from './api/custom-types';
