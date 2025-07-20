import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useMemo } from 'react';
import { ModelResponse, Ollama } from 'ollama/browser';

import { AVAILABLE_MODELS } from './available_models';

export function useOllamaClient() {
  const [ollamaPort, setOllamaPort] = useState<number | null>(null);

  const [installedModels, setInstalledModels] = useState<ModelResponse[]>([]);
  const [loadingInstalledModels, setLoadingInstalledModels] = useState(false);
  const [loadingInstalledModelsError, setLoadingInstalledModelsError] = useState<Error | null>(null);

  /**
   * Ollama is spun up on the backend on a dynamic port
   */
  useEffect(() => {
    (async () => {
      try {
        const port = await invoke<number>('get_ollama_port');
        setOllamaPort(port);
        return port;
      } catch (error) {
        console.error('Failed to get Ollama port:', error);
        throw error;
      }
    }
    )();
  }, []);

  // Create Ollama client instance
  const ollamaClient = useMemo(() => {
    if (!ollamaPort) return null;
    return new Ollama({ host: `http://localhost:${ollamaPort}` });
  }, [ollamaPort]);

  // fetch installed models
  useEffect(() => {
    (async () => {
      if (ollamaClient) {
        try {
          setLoadingInstalledModels(true);
          const { models } = await ollamaClient.list();
          setInstalledModels(models);
        } catch (error) {
          setLoadingInstalledModelsError(error as Error);
        } finally {
          setLoadingInstalledModels(false);
        }
      }
    })();
  }, [ollamaClient]);

  const allAvailableModelLabels = useMemo(() => {
    return Array.from(new Set(AVAILABLE_MODELS.flatMap((model) => model.labels)));
  }, []);

  return {
    ollamaClient,
    // TODO: don't expose ollamaPort, just doing it now as we remove use-post-chat-message...
    ollamaPort,
    installedModels,
    loadingInstalledModels,
    loadingInstalledModelsError,
    availableModels: AVAILABLE_MODELS,
    allAvailableModelLabels,
  }
}
