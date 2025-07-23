import { AbortableAsyncIterator } from 'ollama';
import { ChatResponse, ModelResponse, Ollama, Message as OllamaMessage, Tool as OllamaTool } from 'ollama/browser';
import { create } from 'zustand';

import { ARCHESTRA_SERVER_OLLAMA_PROXY_URL } from '@/consts';
import { OllamaLocalStorage } from '@/lib/local-storage';

import type { MCPServerTools } from '../mcp-servers-store';
import { AVAILABLE_MODELS } from './available_models';

const ollamaClient = new Ollama({ host: ARCHESTRA_SERVER_OLLAMA_PROXY_URL });

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
  chat: (messages: OllamaMessage[], tools?: OllamaTool[]) => Promise<AbortableAsyncIterator<ChatResponse>>;
}

type OllamaStore = OllamaState & OllamaActions;

export const convertServerAndToolNameToOllamaToolName = (serverName: string, toolName: string): string =>
  `${serverName}_${toolName}`;

export const convertOllamaToolNameToServerAndToolName = (ollamaToolName: string) =>
  ollamaToolName.split('_') as [string, string];

export const convertMCPServerToolsToOllamaTools = (mcpServerTools: MCPServerTools): OllamaTool[] => {
  return Object.entries(mcpServerTools).flatMap(([serverName, tools]) =>
    tools.map((tool) => ({
      type: 'function',
      function: {
        name: convertServerAndToolNameToOllamaToolName(serverName, tool.name),
        description: tool.description || `Tool from ${serverName}`,
        parameters: tool.inputSchema as OllamaTool['function']['parameters'],
      },
    }))
  );
};

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
    const { selectedModel } = get();

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
    return ollamaClient.chat({
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

// Fetch installed models on store creation
useOllamaStore.getState().fetchInstalledModels();

// Computed values as selectors
export const useAvailableModels = () => AVAILABLE_MODELS;
export const useAllAvailableModelLabels = () => {
  return Array.from(new Set(AVAILABLE_MODELS.flatMap((model) => model.labels)));
};
