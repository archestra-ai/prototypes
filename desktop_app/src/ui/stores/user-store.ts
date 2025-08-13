import { create } from 'zustand';

import { getUser, updateUser } from '@ui/lib/clients/archestra/api/gen';

interface User {
  id: number;
  hasCompletedOnboarding: number;
  collectTelemetryData: number;
  createdAt: string;
  updatedAt: string;
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
      const { data } = await getUser();
      set({ user: data });
    } finally {
      set({ loading: false });
    }
  },

  checkIfOnboardingIsComplete: () => {
    const { user } = get();
    return user?.hasCompletedOnboarding === 1;
  },

  markOnboardingCompleted: async (collectTelemetryData = false) => {
    const { data } = await updateUser({
      body: {
        hasCompletedOnboarding: 1,
        collectTelemetryData: collectTelemetryData ? 1 : 0,
      },
    });
    set({ user: data });
  },

  toggleTelemetryCollectionStatus: async () => {
    const { user } = get();
    if (!user) return;

    const { data } = await updateUser({
      body: {
        collectTelemetryData: user.collectTelemetryData === 1 ? 0 : 1,
      },
    });
    set({ user: data });
  },
}));

// Fetch user data on store initialization
useUserStore.getState().fetchUser();
