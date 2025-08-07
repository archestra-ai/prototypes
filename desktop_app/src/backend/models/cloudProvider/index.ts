import { eq } from 'drizzle-orm';
import { z } from 'zod';

import db from '@backend/database';
import {
  CloudProviderSchema,
  CloudProviderWithConfigSchema,
  SupportedCloudProviderTypesSchema,
  cloudProvidersTable,
} from '@backend/database/schema/cloudProvider';

export type SupportedCloudProviderTypes = z.infer<typeof SupportedCloudProviderTypesSchema>;
export type CloudProvider = z.infer<typeof CloudProviderSchema>;
export type CloudProviderWithConfig = z.infer<typeof CloudProviderWithConfigSchema>;

export default class CloudProviderModel {
  static async getAll() {
    return await db.select().from(cloudProvidersTable);
  }

  static async getByType(type: SupportedCloudProviderTypes) {
    const [provider] = await db.select().from(cloudProvidersTable).where(eq(cloudProvidersTable.providerType, type));
    return provider;
  }

  static async upsert(type: SupportedCloudProviderTypes, apiKey: string) {
    const existing = await this.getByType(type);

    if (existing) {
      await db
        .update(cloudProvidersTable)
        .set({
          apiKey,
          updatedAt: new Date().toISOString(),
          validatedAt: new Date().toISOString(),
        })
        .where(eq(cloudProvidersTable.providerType, type));
    } else {
      await db.insert(cloudProvidersTable).values({
        providerType: type,
        apiKey,
        validatedAt: new Date().toISOString(),
      });
    }

    const result = await this.getByType(type);
    if (!result) throw new Error('Failed to upsert provider');
    return result;
  }

  static async delete(type: SupportedCloudProviderTypes) {
    await db.delete(cloudProvidersTable).where(eq(cloudProvidersTable.providerType, type));
  }
}

export { CloudProviderSchema, CloudProviderWithConfigSchema, SupportedCloudProviderTypesSchema };
