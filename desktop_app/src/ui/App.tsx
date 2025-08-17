import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';

import OnboardingWizard from '@ui/components/OnboardingWizard';

import { router } from './router';

export default function App() {
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  return (
    <>
      <OnboardingWizard onOpenChange={setIsOnboardingOpen} />
      <div className={`h-full transition-all duration-300 ${isOnboardingOpen ? 'blur-md pointer-events-none' : ''}`}>
        <RouterProvider router={router} />
      </div>
    </>
  );
}
