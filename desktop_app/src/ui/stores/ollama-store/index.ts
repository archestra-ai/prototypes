import { ModelResponse } from 'ollama/browser';
import { create } from 'zustand';

import config from '@ui/config';
import { ArchestraOllamaClient } from '@ui/lib/clients/ollama';
import { OllamaLocalStorage } from '@ui/lib/localStorage';

import { AVAILABLE_MODELS } from './available_models';

const ollamaClient = new ArchestraOllamaClient({ host: config.archestra.ollamaProxyUrl });

interface OllamaState {
  installedModels: ModelResponse[];
  downloadProgress: Record<string, number>;
  loadingInstalledModels: boolean;
  loadingInstalledModelsError: Error | null;
  selectedModel: string;
  modelsBeingDownloaded: Set<string>;
}

interface OllamaActions {
  downloadModel: (fullModelName: string) => Promise<void>;
  fetchInstalledModels: () => Promise<void>;
  setSelectedModel: (model: string) => void;
}

type OllamaStore = OllamaState & OllamaActions;

export const useOllamaStore = create<OllamaStore>((set, get) => ({
  // State
  installedModels: [],
  downloadProgress: {},
  loadingInstalledModels: false,
  loadingInstalledModelsError: null,
  selectedModel: OllamaLocalStorage.getSelectedModel() || '',
  modelsBeingDownloaded: new Set(),

  // Actions
  fetchInstalledModels: async () => {
    const MAX_RETRIES = 30;
    const RETRY_DELAY_MILLISECONDS = 1000;
    let retries = 0;

    const attemptConnection = async (): Promise<boolean> => {
      try {
        const { selectedModel } = get();
        const { models } = await ollamaClient.list();
        set({ installedModels: models });

        const firstInstalledModel = models[0];
        if (!selectedModel && firstInstalledModel && firstInstalledModel.model) {
          get().setSelectedModel(firstInstalledModel.model);
        }

        return true;
      } catch (error) {
        return false;
      }
    };

    set({ loadingInstalledModels: true, loadingInstalledModelsError: null });

    // Keep trying to connect until successful or max retries reached
    while (retries < MAX_RETRIES) {
      const connected = await attemptConnection();
      if (connected) {
        set({ loadingInstalledModels: false });
        return;
      }

      retries++;
      if (retries < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MILLISECONDS));
      }
    }

    // If we've exhausted all retries, set error state
    set({
      loadingInstalledModels: false,
      loadingInstalledModelsError: new Error('Failed to connect to Ollama after maximum retries'),
    });
  },

  downloadModel: async (fullModelName: string) => {
    try {
      // Update progress and downloading set
      set((state) => ({
        downloadProgress: { ...state.downloadProgress, [fullModelName]: 0.1 },
        modelsBeingDownloaded: new Set([...state.modelsBeingDownloaded, fullModelName]),
      }));

      const response = await ollamaClient.pull({
        model: fullModelName,
        stream: true,
      });

      for await (const progress of response) {
        if (progress.total > 0) {
          const percentage = Math.round((progress.completed / progress.total) * 100);
          set((state) => ({
            downloadProgress: {
              ...state.downloadProgress,
              [fullModelName]: percentage,
            },
          }));
        }
      }

      await get().fetchInstalledModels();
    } catch (error) {
    } finally {
      set((state) => {
        const newModelsBeingDownloaded = new Set(state.modelsBeingDownloaded);
        newModelsBeingDownloaded.delete(fullModelName);

        const newDownloadProgress = { ...state.downloadProgress };
        delete newDownloadProgress[fullModelName];

        return {
          modelsBeingDownloaded: newModelsBeingDownloaded,
          downloadProgress: newDownloadProgress,
        };
      });
    }
  },

  setSelectedModel: (model: string) => {
    OllamaLocalStorage.setSelectedModel(model);
    set({ selectedModel: model });
  },
}));

// Fetch installed models on store creation
useOllamaStore.getState().fetchInstalledModels();

// Computed values as selectors
export const useAvailableModels = () => AVAILABLE_MODELS;
export const useAllAvailableModelLabels = () => {
  return Array.from(new Set(AVAILABLE_MODELS.flatMap((model) => model.labels)));
};
