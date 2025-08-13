declare global {
  interface Window {
    electronAPI: {
      serverPort: number;
      websocketPort: number;
      ollamaPort: number;
      openExternal: (url: string) => Promise<void>;
    };
  }
}

export {};
