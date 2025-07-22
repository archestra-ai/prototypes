import { invoke } from '@tauri-apps/api/core';
import { ModelResponse, Ollama } from 'ollama/browser';
import { create } from 'zustand';

import { OllamaLocalStorage } from '@/lib/local-storage';

import { AVAILABLE_MODELS } from './available_models';

interface OllamaState {
  ollamaClient: Ollama | null;
  ollamaPort: number | null;
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
  initializeOllama: () => Promise<void>;
}

type OllamaStore = OllamaState & OllamaActions;

export const useOllamaStore = create<OllamaStore>((set, get) => ({
  // State
  ollamaClient: null,
  ollamaPort: null,
  installedModels: [],
  downloadProgress: {},
  loadingInstalledModels: false,
  loadingInstalledModelsError: null,
  selectedModel: '',
  modelsBeingDownloaded: new Set(),

  // Actions
  initializeOllama: async () => {
    try {
      const port = await invoke<number>('get_ollama_port');
      const client = new Ollama({ host: `http://localhost:${port}` });
      set({ ollamaPort: port, ollamaClient: client });

      // Fetch models after initialization
      await get().fetchInstalledModels();
    } catch (error) {
      console.error('Failed to get Ollama port:', error);
      throw error;
    }
  },

  fetchInstalledModels: async () => {
    const { ollamaClient, selectedModel } = get();
    if (!ollamaClient) return;

    try {
      set({ loadingInstalledModels: true, loadingInstalledModelsError: null });
      const { models } = await ollamaClient.list();
      set({ installedModels: models });

      // if a model is selected in localStorage, use it, otherwise use the first model
      const persistedSelectedModel = OllamaLocalStorage.getSelectedModel();
      if (!selectedModel && persistedSelectedModel) {
        set({ selectedModel: persistedSelectedModel });
      } else if (models.length > 0) {
        set({ selectedModel: models[0].model });
        OllamaLocalStorage.setSelectedModel(models[0].model);
      }
    } catch (error) {
      set({ loadingInstalledModelsError: error as Error });
    } finally {
      set({ loadingInstalledModels: false });
    }
  },

  downloadModel: async (fullModelName: string) => {
    const { ollamaClient } = get();
    if (!ollamaClient) return;

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
      console.error(`Failed to download model ${fullModelName}:`, error);
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
    set({ selectedModel: model });
    OllamaLocalStorage.setSelectedModel(model);
  },
}));

// Initialize Ollama on store creation
useOllamaStore.getState().initializeOllama();

// Computed values as selectors
export const useAvailableModels = () => AVAILABLE_MODELS;
export const useAllAvailableModelLabels = () => {
  return Array.from(new Set(AVAILABLE_MODELS.flatMap((model) => model.labels)));
};
