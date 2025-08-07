import { z } from 'zod';

export const generatePaginatedResponseSchema = (schema: z.ZodType) =>
  z.object({
    data: z.array(schema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  });
