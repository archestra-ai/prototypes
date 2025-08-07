/**
 * NOTE: the ONLY reason why we are installing/importing @anthropic-ai/dxt is that
 * it nicely exports zod schemas for all of its types
 *
 * (as we only get TS types, not zod schemas, from our codegen'd archestra catalog client)
 *
 * https://github.com/anthropics/dxt/blob/main/src/schemas.ts
 */
import { z } from 'zod';

export { McpServerConfigSchema } from '@anthropic-ai/dxt';

export const McpServerUserConfigValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])
);
