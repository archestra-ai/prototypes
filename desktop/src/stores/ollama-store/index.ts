import { invoke } from '@tauri-apps/api/core';
import { AbortableAsyncIterator } from 'ollama';
import { ChatResponse, ModelResponse, Ollama, Message as OllamaMessage, Tool as OllamaTool } from 'ollama/browser';
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
  chat: (messages: OllamaMessage[], tools?: OllamaTool[]) => Promise<AbortableAsyncIterator<ChatResponse>>;
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
  selectedModel: OllamaLocalStorage.getSelectedModel() || '',
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
    if (!ollamaClient) {
      return;
    }

    try {
      set({ loadingInstalledModels: true, loadingInstalledModelsError: null });
      const { models } = await ollamaClient.list();
      set({ installedModels: models });

      const firstInstalledModel = models[0];
      if (!selectedModel && firstInstalledModel && firstInstalledModel.model) {
        get().setSelectedModel(firstInstalledModel.model);
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
    OllamaLocalStorage.setSelectedModel(model);
    set({ selectedModel: model });
  },

  chat: (messages: OllamaMessage[], tools: OllamaTool[] = []) => {
    const { ollamaClient } = get();

    // We can assume at this point that the ollamaClient has been initialized
    return (ollamaClient as Ollama).chat({
      model: get().selectedModel,
      messages,
      tools,
      stream: true,
      options: {
        temperature: 0.7,
        top_p: 0.95,
        top_k: 40,
        num_predict: 32768,
      },
    });
  },
}));

// Initialize Ollama on store creation
useOllamaStore.getState().initializeOllama();

// Computed values as selectors
export const useAvailableModels = () => AVAILABLE_MODELS;
export const useAllAvailableModelLabels = () => {
  return Array.from(new Set(AVAILABLE_MODELS.flatMap((model) => model.labels)));
};
