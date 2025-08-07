import {
  CloudProviderSchema,
  CloudProviderWithConfigSchema,
  SupportedCloudProviderTypesSchema,
} from '@archestra/schemas';
import { z } from 'zod';

export type CloudProvider = z.infer<typeof CloudProviderSchema>;
export type SupportedCloudProviderTypes = z.infer<typeof SupportedCloudProviderTypesSchema>;
export type CloudProviderWithConfig = z.infer<typeof CloudProviderWithConfigSchema>;
