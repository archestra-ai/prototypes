import { z } from 'zod';

export const ChatMessageRoleSchema = z.enum(['user', 'assistant', 'system']);
