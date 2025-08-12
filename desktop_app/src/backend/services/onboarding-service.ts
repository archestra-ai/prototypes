import { eq } from 'drizzle-orm';

import db from '@backend/database';
import { onboardingTable } from '@backend/database/schema/onboarding';
import log from '@backend/utils/logger';

export class OnboardingService {
  async isOnboardingCompleted(): Promise<boolean> {
    try {
      const result = await db.select().from(onboardingTable).limit(1);

      if (result.length === 0) {
        // No record exists, this is a first run
        await db.insert(onboardingTable).values({
          completed: 0,
        });
        return false;
      }

      return result[0].completed === 1;
    } catch (error) {
      log.error('Failed to check onboarding status:', error);
      return false;
    }
  }

  async markOnboardingCompleted(): Promise<void> {
    try {
      const existingRecord = await db.select().from(onboardingTable).limit(1);

      if (existingRecord.length === 0) {
        await db.insert(onboardingTable).values({
          completed: 1,
          completedAt: new Date().toISOString(),
        });
      } else {
        await db
          .update(onboardingTable)
          .set({
            completed: 1,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(onboardingTable.id, existingRecord[0].id));
      }

      log.info('Onboarding marked as completed');
    } catch (error) {
      log.error('Failed to mark onboarding as completed:', error);
      throw error;
    }
  }
}

export const onboardingService = new OnboardingService();
