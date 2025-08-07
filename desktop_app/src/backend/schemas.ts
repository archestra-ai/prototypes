import { z } from 'zod';

export const ErrorResponseSchema = z.object({
  error: z.string(),
});

export const StringNumberIdSchema = z.string().transform((val) => parseInt(val, 10));
