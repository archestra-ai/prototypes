import { create } from 'zustand';

import { type User, getUser, updateUser } from '@ui/lib/clients/archestra/api/gen';

interface UserStore {
  user: User | null;
  loading: boolean;

  fetchUser: () => Promise<void>;
  markOnboardingCompleted: () => Promise<void>;
  toggleTelemetryCollectionStatus: (collectTelemetryData: boolean) => Promise<void>;
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

  markOnboardingCompleted: async () => {
    const { data } = await updateUser({ body: { hasCompletedOnboarding: true } });
    set({ user: data });
  },

  toggleTelemetryCollectionStatus: async (collectTelemetryData: boolean) => {
    const { user } = get();
    if (!user) return;

    const { data } = await updateUser({ body: { collectTelemetryData } });
    set({ user: data });
  },
}));

/**
 * Fetch user data on store initialization
 */
useUserStore.getState().fetchUser();
