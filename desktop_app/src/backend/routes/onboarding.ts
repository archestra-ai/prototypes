import { FastifyInstance } from 'fastify';

import { onboardingService } from '@backend/services/onboarding-service';

export async function onboardingRoutes(app: FastifyInstance) {
  app.get('/api/onboarding/status', async (request, reply) => {
    const completed = await onboardingService.isOnboardingCompleted();
    return { completed };
  });

  app.post('/api/onboarding/complete', async (request, reply) => {
    await onboardingService.markOnboardingCompleted();
    return { success: true };
  });
}
