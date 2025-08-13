import { eq } from 'drizzle-orm';

import db from '@backend/database';
import { organizationTable } from '@backend/database/schema/organization';
import log from '@backend/utils/logger';

export default class OrganizationModel {
  static async ensureOrganizationExists(): Promise<void> {
    try {
      const result = await db.select().from(organizationTable).limit(1);

      if (result.length === 0) {
        // No record exists, create the default organization
        await db.insert(organizationTable).values({
          hasCompletedOnboarding: 0,
          collectTelemetryData: 0,
        });
        log.info('Created default organization record');
      }
    } catch (error) {
      log.error('Failed to ensure organization exists:', error);
      throw error;
    }
  }

  static async isOnboardingCompleted(): Promise<boolean> {
    try {
      await this.ensureOrganizationExists();
      const result = await db.select().from(organizationTable).limit(1);
      return result[0].hasCompletedOnboarding === 1;
    } catch (error) {
      log.error('Failed to check onboarding status:', error);
      return false;
    }
  }

  static async markOnboardingCompleted(): Promise<void> {
    try {
      await this.ensureOrganizationExists();
      const existingRecord = await db.select().from(organizationTable).limit(1);

      await db
        .update(organizationTable)
        .set({
          hasCompletedOnboarding: 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(organizationTable.id, existingRecord[0].id));

      log.info('Onboarding marked as completed');
    } catch (error) {
      log.error('Failed to mark onboarding as completed:', error);
      throw error;
    }
  }
}
