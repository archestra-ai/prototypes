"use client";

import { invoke } from "@tauri-apps/api/core";
import { createContext, useContext, useState, ReactNode, useEffect } from "react";

interface IOllamaServerContext {
  ollamaStatus: string;
  isOllamaRunning: boolean;
  ollamaPort: number | null;
  setOllamaStatus: (status: string) => void;
}

const OllamaServerContext = createContext<IOllamaServerContext | null>(null);

interface OllamaServerProviderProps {
  children: ReactNode;
}

export function OllamaServerProvider({ children }: OllamaServerProviderProps) {
  const [ollamaStatus, setOllamaStatus] = useState("Checking Ollama server status...");
  const [isOllamaRunning, setIsOllamaRunning] = useState(false);
  const [ollamaPort, setOllamaPort] = useState<number | null>(null);

  // Check Ollama server status on mount
  useEffect(() => {
    const checkOllamaStatus = async () => {
      try {
        const port = await invoke<number>("get_ollama_port");
        setOllamaPort(port);
        setIsOllamaRunning(true);
        setOllamaStatus(`Ollama server is running on port ${port}`);
      } catch (error) {
        console.error("Error getting Ollama port:", error);
        setIsOllamaRunning(false);
        setOllamaPort(null);
        setOllamaStatus("Ollama server is not running");
      }
    };

    checkOllamaStatus();
  }, []);

  const contextValue: IOllamaServerContext = {
    ollamaStatus,
    isOllamaRunning,
    ollamaPort,
    setOllamaStatus,
  };

  return <OllamaServerContext.Provider value={contextValue}>{children}</OllamaServerContext.Provider>;
}

export function useOllamaServer(): IOllamaServerContext {
  const context = useContext(OllamaServerContext);
  if (!context) {
    throw new Error("useOllamaServer must be used within a OllamaServerProvider.");
  }
  return context;
}
