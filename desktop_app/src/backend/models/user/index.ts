import { eq } from 'drizzle-orm';

import db from '@backend/database';
import { userTable } from '@backend/database/schema/user';
import log from '@backend/utils/logger';

export default class UserModel {
  static async ensureUserExists(): Promise<void> {
    try {
      const result = await db.select().from(userTable).limit(1);

      if (result.length === 0) {
        // No record exists, create the default user
        await db.insert(userTable).values({
          hasCompletedOnboarding: 0,
          collectTelemetryData: 0,
        });
        log.info('Created default user record');
      }
    } catch (error) {
      log.error('Failed to ensure user exists:', error);
      throw error;
    }
  }

  static async isOnboardingCompleted(): Promise<boolean> {
    try {
      await this.ensureUserExists();
      const result = await db.select().from(userTable).limit(1);
      return result[0].hasCompletedOnboarding === 1;
    } catch (error) {
      log.error('Failed to check onboarding status:', error);
      return false;
    }
  }

  static async markOnboardingCompleted(): Promise<void> {
    try {
      await this.ensureUserExists();
      const existingRecord = await db.select().from(userTable).limit(1);

      await db
        .update(userTable)
        .set({
          hasCompletedOnboarding: 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(userTable.id, existingRecord[0].id));

      log.info('Onboarding marked as completed');
    } catch (error) {
      log.error('Failed to mark onboarding as completed:', error);
      throw error;
    }
  }
}
