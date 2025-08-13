import { create } from 'zustand';

import { isOnboardingCompleted, markOnboardingCompleted } from '@ui/lib/clients/archestra/api/gen';

interface User {
  hasCompletedOnboarding: boolean;
  collectTelemetryData: boolean;
}

interface UserStore {
  user: User | null;
  loading: boolean;

  fetchUser: () => Promise<void>;
  checkIfOnboardingIsComplete: () => boolean;
  markOnboardingCompleted: (collectTelemetryData?: boolean) => Promise<void>;
  toggleTelemetryCollectionStatus: () => Promise<void>;
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  loading: false,

  fetchUser: async () => {
    set({ loading: true });
    try {
      const { data } = await isOnboardingCompleted();
      // For now, we only get the completed status from the API
      // In the future, we'll need to expand the API to return full user data
      set({
        user: {
          hasCompletedOnboarding: data.completed,
          collectTelemetryData: false, // Default to false until we can fetch from API
        },
      });
    } finally {
      set({ loading: false });
    }
  },

  checkIfOnboardingIsComplete: () => {
    const { user } = get();
    return user?.hasCompletedOnboarding ?? false;
  },

  markOnboardingCompleted: async (collectTelemetryData = false) => {
    await markOnboardingCompleted();
    // Update local state
    set((state) => ({
      user: {
        ...state.user,
        hasCompletedOnboarding: true,
        collectTelemetryData,
      } as User,
    }));
  },

  toggleTelemetryCollectionStatus: async () => {
    const { user } = get();
    if (!user) return;

    // TODO: Implement API endpoint to update telemetry collection status
    // For now, just update local state
    set((state) => ({
      user: {
        ...state.user!,
        collectTelemetryData: !state.user!.collectTelemetryData,
      },
    }));
  },
}));

// Fetch user data on store initialization
useUserStore.getState().fetchUser();
