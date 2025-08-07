import { ExternalMcpClientNameSchema, ExternalMcpClientSchema } from '@archestra/schemas';
import { z } from 'zod';

export type ExternalMcpClientName = z.infer<typeof ExternalMcpClientNameSchema>;
export type ExternalMcpClient = z.infer<typeof ExternalMcpClientSchema>;
