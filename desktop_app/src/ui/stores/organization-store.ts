import { create } from 'zustand';

import { isOnboardingCompleted, markOnboardingCompleted } from '@ui/lib/clients/archestra/api/gen';

interface Organization {
  hasCompletedOnboarding: boolean;
  collectTelemetryData: boolean;
}

interface OrganizationStore {
  organization: Organization | null;
  loading: boolean;

  fetchOrganization: () => Promise<void>;
  checkIfOnboardingIsComplete: () => boolean;
  markOnboardingCompleted: (collectTelemetryData?: boolean) => Promise<void>;
  toggleTelemetryCollectionStatus: () => Promise<void>;
}

export const useOrganizationStore = create<OrganizationStore>((set, get) => ({
  organization: null,
  loading: false,

  fetchOrganization: async () => {
    set({ loading: true });
    try {
      const { data } = await isOnboardingCompleted();
      // For now, we only get the completed status from the API
      // In the future, we'll need to expand the API to return full organization data
      set({
        organization: {
          hasCompletedOnboarding: data.completed,
          collectTelemetryData: false, // Default to false until we can fetch from API
        },
      });
    } finally {
      set({ loading: false });
    }
  },

  checkIfOnboardingIsComplete: () => {
    const { organization } = get();
    return organization?.hasCompletedOnboarding ?? false;
  },

  markOnboardingCompleted: async (collectTelemetryData = false) => {
    await markOnboardingCompleted();
    // Update local state
    set((state) => ({
      organization: {
        ...state.organization,
        hasCompletedOnboarding: true,
        collectTelemetryData,
      } as Organization,
    }));
  },

  toggleTelemetryCollectionStatus: async () => {
    const { organization } = get();
    if (!organization) return;

    // TODO: Implement API endpoint to update telemetry collection status
    // For now, just update local state
    set((state) => ({
      organization: {
        ...state.organization!,
        collectTelemetryData: !state.organization!.collectTelemetryData,
      },
    }));
  },
}));

// Fetch organization data on store initialization
useOrganizationStore.getState().fetchOrganization();
