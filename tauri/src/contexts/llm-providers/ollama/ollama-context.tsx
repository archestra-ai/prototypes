import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ModelResponse, Ollama } from "ollama/browser";
import { AVAILABLE_MODELS } from "./available_models";

interface OllamaContextType {
  ollamaClient: Ollama | null;
  installedModels: ModelResponse[];
  downloadProgress: Record<string, number>;
  loadingInstalledModels: boolean;
  loadingInstalledModelsError: Error | null;
  availableModels: typeof AVAILABLE_MODELS;
  allAvailableModelLabels: string[];
  selectedModel: string;
  modelsBeingDownloaded: Set<string>;
  downloadModel: (fullModelName: string) => Promise<void>;
  fetchInstalledModels: () => Promise<void>;
  setSelectedModel: (model: string) => void;
}

const OllamaContext = createContext<OllamaContextType | undefined>(undefined);

export function OllamaProvider({ children }: { children: React.ReactNode }) {
  const [ollamaPort, setOllamaPort] = useState<number | null>(null);
  const [installedModels, setInstalledModels] = useState<ModelResponse[]>([]);
  const [loadingInstalledModels, setLoadingInstalledModels] = useState(false);
  const [loadingInstalledModelsError, setLoadingInstalledModelsError] = useState<Error | null>(null);
  const [modelsBeingDownloaded, setModelsBeingDownloaded] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [selectedModel, setSelectedModel] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const port = await invoke<number>("get_ollama_port");
        setOllamaPort(port);
        return port;
      } catch (error) {
        console.error("Failed to get Ollama port:", error);
        throw error;
      }
    })();
  }, []);

  const ollamaClient = useMemo(() => {
    if (!ollamaPort) return null;
    return new Ollama({ host: `http://localhost:${ollamaPort}` });
  }, [ollamaPort]);

  const fetchInstalledModels = useCallback(async () => {
    if (ollamaClient) {
      try {
        setLoadingInstalledModels(true);
        const { models } = await ollamaClient.list();
        setInstalledModels(models);

        if (models.length > 0 && !selectedModel) {
          setSelectedModel(models[0].model);
        }
      } catch (error) {
        setLoadingInstalledModelsError(error as Error);
      } finally {
        setLoadingInstalledModels(false);
      }
    }
  }, [ollamaClient, selectedModel]);

  const downloadModel = useCallback(
    async (fullModelName: string) => {
      if (ollamaClient) {
        try {
          setDownloadProgress((prev) => ({ ...prev, [fullModelName]: 0.1 }));
          setModelsBeingDownloaded((prev) => new Set([...prev, fullModelName]));

          const response = await ollamaClient.pull({
            model: fullModelName,
            stream: true,
          });

          for await (const progress of response) {
            if (progress.total > 0) {
              const percentage = Math.round(
                (progress.completed / progress.total) * 100,
              );
              setDownloadProgress((prev) => ({
                ...prev,
                [fullModelName]: percentage,
              }));
            }
          }

          await fetchInstalledModels();
        } catch (error) {
          console.error(`Failed to download model ${fullModelName}:`, error);
        } finally {
          setModelsBeingDownloaded((prev) => {
            const newSet = new Set(prev);
            newSet.delete(fullModelName);
            return newSet;
          });

          setDownloadProgress((prev) => {
            const newProgress = { ...prev };
            delete newProgress[fullModelName];
            return newProgress;
          });
        }
      }
    },
    [ollamaClient, fetchInstalledModels],
  );

  useEffect(() => {
    fetchInstalledModels();
  }, [ollamaClient]);

  const allAvailableModelLabels = useMemo(() => {
    return Array.from(
      new Set(AVAILABLE_MODELS.flatMap((model) => model.labels)),
    );
  }, []);

  const value: OllamaContextType = {
    ollamaClient,
    installedModels,
    downloadProgress,
    loadingInstalledModels,
    loadingInstalledModelsError,
    availableModels: AVAILABLE_MODELS,
    allAvailableModelLabels,
    selectedModel,
    modelsBeingDownloaded,
    downloadModel,
    fetchInstalledModels,
    setSelectedModel,
  };

  return <OllamaContext.Provider value={value}>{children}</OllamaContext.Provider>;
}

export function useOllamaContext() {
  const context = useContext(OllamaContext);
  if (context === undefined) {
    throw new Error("useOllamaContext must be used within an OllamaProvider");
  }
  return context;
}
