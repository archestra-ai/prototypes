import { eq } from 'drizzle-orm';

import db from '@backend/database';
import { CloudProvider, NewCloudProvider, cloudProvidersTable } from '@backend/database/schema/cloudProvider';

class CloudProviderModel {
  async getAll(): Promise<CloudProvider[]> {
    const providers = await db.select().from(cloudProvidersTable);
    return providers as CloudProvider[];
  }

  async getByType(type: string): Promise<CloudProvider | null> {
    const [provider] = await db
      .select()
      .from(cloudProvidersTable)
      .where(eq(cloudProvidersTable.providerType, type));

    return provider as CloudProvider | null;
  }

  async upsert(type: string, apiKey: string): Promise<CloudProvider> {
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

  async delete(type: string): Promise<void> {
    await db.delete(cloudProvidersTable).where(eq(cloudProvidersTable.providerType, type));
  }
}

export default new CloudProviderModel();