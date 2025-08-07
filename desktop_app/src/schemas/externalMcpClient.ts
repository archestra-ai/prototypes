import { z } from 'zod';

export const ExternalMcpClientNameSchema = z.enum(['claude', 'cursor', 'vscode']);

export const ExternalMcpClientSchema = z.object({
  client_name: ExternalMcpClientNameSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
