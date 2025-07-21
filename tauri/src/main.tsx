import React from "react";
import ReactDOM from "react-dom/client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ThemeProvider } from "./contexts/theme-context";
import { OllamaProvider } from "./contexts/llm-providers/ollama/ollama-context";
import { MCPServersProvider } from "./contexts/mcp-servers-context";
import { ChatProvider } from "./contexts/chat-context";
import { ConnectorCatalogProvider } from "./contexts/connector-catalog-context";
import { ExternalMCPClientsProvider } from "./contexts/external-mcp-clients-context";

import App from "./App";

import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <OllamaProvider>
          <MCPServersProvider>
            <ExternalMCPClientsProvider>
              <ConnectorCatalogProvider>
                <ChatProvider>
                  <App />
                </ChatProvider>
              </ConnectorCatalogProvider>
            </ExternalMCPClientsProvider>
          </MCPServersProvider>
        </OllamaProvider>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
