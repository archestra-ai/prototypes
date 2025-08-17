import { ModelResponse } from 'ollama/browser';
import { create } from 'zustand';

import config from '@ui/config';
import {
  OllamaModelDownloadProgress,
  OllamaRequiredModelStatus,
  getOllamaRequiredModelsStatus,
} from '@ui/lib/clients/archestra/api/gen';
import { ArchestraOllamaClient } from '@ui/lib/clients/ollama';
import { OllamaLocalStorage } from '@ui/lib/localStorage';
import websocketService from '@ui/lib/websocket';

import { AVAILABLE_MODELS } from './available_models';

const ollamaClient = new ArchestraOllamaClient({ host: config.archestra.ollamaProxyUrl });

interface OllamaState {
  installedModels: ModelResponse[];
  downloadProgress: Record<string, number>;
  loadingInstalledModels: boolean;
  loadingInstalledModelsError: Error | null;
  selectedModel: string;
  modelsBeingDownloaded: Set<string>;

  requiredModelsStatus: OllamaRequiredModelStatus[];
  requiredModelsDownloadProgress: Record<string, OllamaModelDownloadProgress>;
  loadingRequiredModels: boolean;
}

interface OllamaActions {
  downloadModel: (fullModelName: string) => Promise<void>;
  fetchInstalledModels: () => Promise<void>;
  setSelectedModel: (model: string) => void;

  fetchRequiredModelsStatus: () => Promise<void>;
  updateRequiredModelDownloadProgress: (progress: OllamaModelDownloadProgress) => void;
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
  requiredModelsStatus: [],
  requiredModelsDownloadProgress: {},
  loadingRequiredModels: true,

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

  fetchRequiredModelsStatus: async () => {
    try {
      const { data } = await getOllamaRequiredModelsStatus();
      if (data) {
        set({ requiredModelsStatus: data.models, loadingRequiredModels: false });
      }
    } catch (error) {
      console.error('Failed to fetch required models:', error);
      set({ loadingRequiredModels: false });
    }
  },

  updateRequiredModelDownloadProgress: (progress: OllamaModelDownloadProgress) => {
    set((state) => ({
      requiredModelsDownloadProgress: {
        ...state.requiredModelsDownloadProgress,
        [progress.model]: progress,
      },
    }));
  },
}));

// Fetch installed/required-models-status on store creation
useOllamaStore.getState().fetchInstalledModels();
useOllamaStore.getState().fetchRequiredModelsStatus();

websocketService.subscribe('ollama-model-download-progress', ({ payload }) => {
  useOllamaStore.getState().updateRequiredModelDownloadProgress(payload);
});

// Computed values as selectors
export const useAvailableModels = () => AVAILABLE_MODELS;
export const useAllAvailableModelLabels = () => {
  return Array.from(new Set(AVAILABLE_MODELS.flatMap((model) => model.labels)));
};
