import { z } from 'zod';

export const ErrorResponseSchema = z.object({
  error: z.string(),
});

export const StringNumberIdSchema = z.string().transform((val) => parseInt(val, 10));

export const generatePaginatedResponseSchema = (schema: z.ZodType) =>
  z.object({
    data: z.array(schema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  });
