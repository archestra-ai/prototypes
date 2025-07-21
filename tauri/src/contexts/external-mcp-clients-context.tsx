import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";


interface ExternalMcpClient {
  id: number;
  client_name: string;
  is_connected: boolean;
  last_connected: string;
  config_path: string;
  created_at: string;
  updated_at: string;
}

interface ExternalMCPClientsContextType {
  supportedExternalMcpClientNames: string[];
  isLoadingSupportedExternalMcpClientNames: boolean;
  errorLoadingSupportedExternalMcpClientNames: string | null;
  connectedExternalMcpClients: ExternalMcpClient[];
  isLoadingConnectedExternalMcpClients: boolean;
  errorLoadingConnectedExternalMcpClients: string | null;
  isConnectingExternalMcpClient: boolean;
  errorConnectingExternalMcpClient: string | null;
  isDisconnectingExternalMcpClient: boolean;
  errorDisconnectingExternalMcpClient: string | null;
  connectExternalMcpClient: (clientName: string) => Promise<void>;
  disconnectExternalMcpClient: (clientId: string) => Promise<void>;
}

const ExternalMCPClientsContext = createContext<ExternalMCPClientsContextType | undefined>(undefined);


export function ExternalMCPClientsProvider({ children }: { children: React.ReactNode }) {
  const [supportedExternalMcpClientNames, setSupportedExternalMcpClientNames] = useState<string[]>([]);
  const [isLoadingSupportedExternalMcpClientNames, setIsLoadingSupportedExternalMcpClientNames] = useState(true);
  const [errorLoadingSupportedExternalMcpClientNames, setErrorLoadingSupportedExternalMcpClientNames] = useState<string | null>(null);

  const [connectedExternalMcpClients, setConnectedExternalMcpClients] = useState<ExternalMcpClient[]>([]);
  const [isLoadingConnectedExternalMcpClients, setIsLoadingConnectedExternalMcpClients] = useState(true);
  const [errorLoadingConnectedExternalMcpClients, setErrorLoadingConnectedExternalMcpClients] = useState<string | null>(null);

  const [isConnectingExternalMcpClient, setIsConnectingExternalMcpClient] = useState(false);
  const [errorConnectingExternalMcpClient, setErrorConnectingExternalMcpClient] = useState<string | null>(null);

  const [isDisconnectingExternalMcpClient, setIsDisconnectingExternalMcpClient] = useState(false);
  const [errorDisconnectingExternalMcpClient, setErrorDisconnectingExternalMcpClient] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setIsLoadingSupportedExternalMcpClientNames(true);
        const clients = await invoke<string[]>("get_supported_external_mcp_client_names");
        setSupportedExternalMcpClientNames(clients);
      } catch (error) {
        setErrorLoadingSupportedExternalMcpClientNames(error as string);
      } finally {
        setIsLoadingSupportedExternalMcpClientNames(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setIsLoadingConnectedExternalMcpClients(true);
        const clients = await invoke<ExternalMcpClient[]>("get_connected_external_mcp_clients");
        setConnectedExternalMcpClients(clients);
      } catch (error) {
        setErrorLoadingConnectedExternalMcpClients(error as string);
      } finally {
        setIsLoadingConnectedExternalMcpClients(false);
      }
    })();
  }, []);

  const connectExternalMcpClient = useCallback(async (clientId: string) => {
    try {
      setIsConnectingExternalMcpClient(true);
      await invoke("connect_external_mcp_client", { clientId });
    } catch (error) {
      setErrorConnectingExternalMcpClient(error as string);
    } finally {
      setIsConnectingExternalMcpClient(false);
    }
  }, []);

  const disconnectExternalMcpClient = useCallback(async (clientId: string) => {
    try {
      setIsDisconnectingExternalMcpClient(true);
      await invoke("disconnect_external_mcp_client", { clientId });
    } catch (error) {
      setErrorDisconnectingExternalMcpClient(error as string);
    } finally {
      setIsDisconnectingExternalMcpClient(false);
    }
  }, []);

  const value: ExternalMCPClientsContextType = {
    supportedExternalMcpClientNames,
    isLoadingSupportedExternalMcpClientNames,
    errorLoadingSupportedExternalMcpClientNames,
    connectedExternalMcpClients,
    isLoadingConnectedExternalMcpClients,
    errorLoadingConnectedExternalMcpClients,
    isConnectingExternalMcpClient,
    errorConnectingExternalMcpClient,
    isDisconnectingExternalMcpClient,
    errorDisconnectingExternalMcpClient,
    connectExternalMcpClient,
    disconnectExternalMcpClient,
  };

  return <ExternalMCPClientsContext.Provider value={value}>{children}</ExternalMCPClientsContext.Provider>;
}

export function useExternalMcpClients() {
  const context = useContext(ExternalMCPClientsContext);
  if (context === undefined) {
    throw new Error('useExternalMcpClients must be used within an ExternalMCPClientsProvider');
  }
  return context;
}
