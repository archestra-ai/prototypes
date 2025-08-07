import { ChatMessageRoleSchema } from '@archestra/schemas';
import { z } from 'zod';

export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>;
