import { create } from 'zustand';

import {
  type CloudProviderWithConfig,
  type SupportedCloudProviderModel,
  type SupportedCloudProviders,
  configureCloudProvider,
  deleteCloudProvider,
  getAvailableCloudProviders,
  getCloudProviderModels,
} from '@ui/lib/clients/archestra/api/gen';

interface CloudProvidersStore {
  cloudProviders: CloudProviderWithConfig[];
  loadingCloudProviders: boolean;

  availableCloudProviderModels: SupportedCloudProviderModel[];
  loadingAvailableCloudProviderModels: boolean;

  loadCloudProviders: () => Promise<void>;
  configureCloudProvider: (type: SupportedCloudProviders, apiKey: string) => Promise<void>;
  deleteCloudProvider: (type: SupportedCloudProviders) => Promise<void>;
  getAvailableCloudProviderModels: () => Promise<void>;
}

export const useCloudProvidersStore = create<CloudProvidersStore>((set, get) => ({
  cloudProviders: [],
  loadingCloudProviders: false,

  availableCloudProviderModels: [],
  loadingAvailableCloudProviderModels: false,

  loadCloudProviders: async () => {
    set({ loadingCloudProviders: true });
    try {
      const { data } = await getAvailableCloudProviders();
      set({ cloudProviders: data });
    } finally {
      set({ loadingCloudProviders: false });
    }
  },

  configureCloudProvider: async (type: SupportedCloudProviders, apiKey: string) => {
    await configureCloudProvider({ body: { type, apiKey } });
    await get().loadCloudProviders();
  },

  deleteCloudProvider: async (type: SupportedCloudProviders) => {
    await deleteCloudProvider({ path: { type } });
    await get().loadCloudProviders();
  },

  getAvailableCloudProviderModels: async () => {
    set({ loadingAvailableCloudProviderModels: true });
    try {
      const { data } = await getCloudProviderModels();
      set({ availableCloudProviderModels: data });
    } finally {
      set({ loadingAvailableCloudProviderModels: false });
    }
  },
}));

// Initialize data on store creation
useCloudProvidersStore.getState().loadCloudProviders();
useCloudProvidersStore.getState().getAvailableCloudProviderModels();
