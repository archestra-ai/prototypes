import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useMCPServers } from "./use-mcp-servers";
import { MCPServer, ServerConfig } from "../types";

interface OAuthConfig {
  provider: string;
  required: boolean;
}

interface ConnectorCatalogEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  version: string;
  homepage: string;
  repository: string;
  oauth?: OAuthConfig;
  server_config: ServerConfig;
  image?: string;
}

export function useConnectorCatalog() {
  const { setInstalledMCPServers } = useMCPServers();

  const [connectorCatalog, setConnectorCatalog] = useState<ConnectorCatalogEntry[]>([]);
  const [loadingConnectorCatalog, setLoadingConnectorCatalog] = useState(false);
  const [errorFetchingConnectorCatalog, setErrorFetchingConnectorCatalog] = useState<string | null>(null);

  const [installingMcpServer, setInstallingMcpServer] = useState<ConnectorCatalogEntry | null>(null);
  const [errorInstallingMcpServer, setErrorInstallingMcpServer] = useState<string | null>(null);

  const [uninstallingMcpServer, setUninstallingMcpServer] = useState<boolean>(false);
  const [errorUninstallingMcpServer, setErrorUninstallingMcpServer] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoadingConnectorCatalog(true);

        /**
         * Tools are pushed to the UI as the mcp servers are spun up and we are able to fetch
         * the avaible tools from the running mcp servers.
         */
        const catalogData = await invoke<ConnectorCatalogEntry[]>("get_mcp_connector_catalog");
        setConnectorCatalog(catalogData.map((entry) => ({ ...entry, tools: [] })));
      } catch (error) {
        setErrorFetchingConnectorCatalog(error as string);
      } finally {
        setLoadingConnectorCatalog(false);
      }
    })();
  }, []);

  const installMcpServerFromConnectorCatalog = useCallback(async (mcpServer: ConnectorCatalogEntry) => {
    const { oauth, title, id } = mcpServer;

    try {
      setInstallingMcpServer(mcpServer);

      // Check if OAuth is required
      if (oauth?.required) {
        try {
          // Start OAuth flow
          await invoke("start_oauth_auth", { service: id });

          // For OAuth connectors, the backend will handle the installation after successful auth
          alert(`OAuth setup started for ${title}. Please complete the authentication in your browser.`);
        } catch (error) {
          setErrorInstallingMcpServer(error as string);
        }
      } else {
        const result = await invoke<MCPServer>("save_mcp_server_from_catalog", { connectorId: id });

        setInstalledMCPServers((prev) => [
          ...prev,
          {
            ...result,
            tools: [],
            client: null,
            status: 'connecting',
          }]);
      }
    } catch (error) {
      setErrorInstallingMcpServer(error as string);
    } finally {
      setInstallingMcpServer(null);
    }
  }, []);

  const uninstallMcpServer = useCallback(async (mcpServerName: string) => {
    (async () => {
      try {
        setUninstallingMcpServer(true);
        await invoke("uninstall_mcp_server", { name: mcpServerName });
        setInstalledMCPServers((prev) => prev.filter((mcpServer) => mcpServer.name !== mcpServerName));
      } catch (error) {
        setErrorUninstallingMcpServer(error as string);
      } finally {
        setUninstallingMcpServer(false);
      }
    })();
  }, []);

  return {
    connectorCatalog,
    loadingConnectorCatalog,
    errorFetchingConnectorCatalog,
    installingMcpServer,
    errorInstallingMcpServer,
    uninstallingMcpServer,
    errorUninstallingMcpServer,
    installMcpServerFromConnectorCatalog,
    uninstallMcpServer,
  };
}
