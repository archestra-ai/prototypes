import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

interface ServerConfig {
  transport: string;
  command: string;
  args: string[];
  env: { [key: string]: string };
}

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

interface ConnectorCatalogEntryWithTools extends ConnectorCatalogEntry {
  tools: Tool[];
}

interface McpServer {
  name: string;
  server_config: ServerConfig;
  meta: { [key: string]: any };
}

export interface McpServerWithTools extends McpServer {
  tools: Tool[];
}

export function useConnectorCatalog() {
  const [connectorCatalog, setConnectorCatalog] = useState<ConnectorCatalogEntryWithTools[]>([]);
  const [loadingConnectorCatalog, setLoadingConnectorCatalog] = useState(false);
  const [errorFetchingConnectorCatalog, setErrorFetchingConnectorCatalog] = useState<string | null>(null);

  const [installingMcpServer, setInstallingMcpServer] = useState<ConnectorCatalogEntry | null>(null);
  const [errorInstallingMcpServer, setErrorInstallingMcpServer] = useState<string | null>(null);

  const [installedMcpServers, setInstalledMcpServers] = useState<McpServerWithTools[]>([]);
  const [loadingInstalledMcpServers, setLoadingInstalledMcpServers] = useState(false);
  const [errorLoadingInstalledMcpServers, setErrorLoadingInstalledMcpServers] = useState<string | null>(null);

  const [uninstallingMcpServer, setUninstallingMcpServer] = useState<boolean>(false);
  const [errorUninstallingMcpServer, setErrorUninstallingMcpServer] = useState<string | null>(null);

  const [isLoadingMcpServerTools, _setIsLoadingMcpServerTools] = useState<boolean>(false);
  const [errorLoadingMcpServerTools, _setErrorLoadingMcpServerTools] = useState<string | null>(null);

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

  useEffect(() => {
    (async () => {
      try {
        setLoadingInstalledMcpServers(true);
        const installedMcpServers = await invoke<McpServer[]>("load_installed_mcp_servers");
        setInstalledMcpServers(installedMcpServers.map((mcpServer) => ({ ...mcpServer, tools: [] })));
      } catch (error) {
        setErrorLoadingInstalledMcpServers(error as string);
      } finally {
        setLoadingInstalledMcpServers(false);
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
        const result = await invoke<McpServer>("save_mcp_server_from_catalog", { connectorId: id });
        setInstalledMcpServers((prev) => [...prev, { ...result, tools: [] }]);
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
        setInstalledMcpServers((prev) => prev.filter((mcpServer) => mcpServer.name !== mcpServerName));
      } catch (error) {
        setErrorUninstallingMcpServer(error as string);
      } finally {
        setUninstallingMcpServer(false);
      }
    })();
  }, []);

  // TODO: tool calling.. we should have McpServerManager polling the mcp servers for their tools and emitting
  // events to the frontend (which it is subscribed for) and updating installedMcpServers and connectorCatalog

  return {
    connectorCatalog,
    installedMcpServers,
    loadingConnectorCatalog,
    errorFetchingConnectorCatalog,
    loadingInstalledMcpServers,
    errorLoadingInstalledMcpServers,
    installingMcpServer,
    errorInstallingMcpServer,
    uninstallingMcpServer,
    errorUninstallingMcpServer,
    isLoadingMcpServerTools,
    errorLoadingMcpServerTools,
    installMcpServerFromConnectorCatalog,
    uninstallMcpServer,
  };
}
