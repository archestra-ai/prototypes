import { create } from 'zustand';

import {
  configureCloudProvider,
  deleteCloudProvider,
  getAvailableCloudProviders,
  getCloudProviderModels,
} from '@clients/archestra/api/gen';

interface CloudProvider {
  type: string;
  name: string;
  apiKeyUrl: string;
  apiKeyPlaceholder: string;
  models: string[];
  configured: boolean;
  enabled: boolean;
  validatedAt: string | null;
}

interface CloudProvidersStore {
  providers: CloudProvider[];
  loading: boolean;

  loadProviders: () => Promise<void>;
  saveProvider: (type: string, apiKey: string) => Promise<void>;
  deleteProvider: (type: string) => Promise<void>;
  getAvailableModels: () => Promise<Array<{ id: string; provider: string }>>;
}

export const useCloudProvidersStore = create<CloudProvidersStore>((set, get) => ({
  providers: [],
  loading: false,

  loadProviders: async () => {
    set({ loading: true });
    try {
      const response = await getAvailableCloudProviders();
      if (response.data) {
        const data = response.data as { providers: CloudProvider[] };
        set({ providers: data.providers });
      }
    } finally {
      set({ loading: false });
    }
  },

  saveProvider: async (type: string, apiKey: string) => {
    await configureCloudProvider({ body: { type, apiKey } } as any);
    await get().loadProviders();
  },

  deleteProvider: async (type: string) => {
    await deleteCloudProvider({ path: { type } });
    await get().loadProviders();
  },

  getAvailableModels: async () => {
    const response = await getCloudProviderModels();
    const data = response.data as { models: Array<{ id: string; provider: string }> } | undefined;
    return data?.models || [];
  },
}));
