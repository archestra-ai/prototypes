import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';
import { useMCPServers } from './use-mcp-servers';
import { MCPServer, ConnectedMCPServer, ServerConfig } from '../types';
import { constructProxiedMCPServerUrl } from '../lib/utils';

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

  const [connectorCatalog, setConnectorCatalog] = useState<
    ConnectorCatalogEntry[]
  >([]);
  const [loadingConnectorCatalog, setLoadingConnectorCatalog] = useState(false);
  const [errorFetchingConnectorCatalog, setErrorFetchingConnectorCatalog] =
    useState<string | null>(null);

  const [installingMcpServerName, setInstallingMcpServerName] = useState<
    string | null
  >(null);
  const [errorInstallingMcpServer, setErrorInstallingMcpServer] = useState<
    string | null
  >(null);

  const [uninstallingMcpServerName, setUninstallingMcpServerName] = useState<
    string | null
  >(null);
  const [errorUninstallingMcpServer, setErrorUninstallingMcpServer] = useState<
    string | null
  >(null);

  useEffect(() => {
    (async () => {
      try {
        setLoadingConnectorCatalog(true);

        /**
         * Tools are pushed to the UI as the mcp servers are spun up and we are able to fetch
         * the avaible tools from the running mcp servers.
         */
        const catalogData = await invoke<ConnectorCatalogEntry[]>(
          'get_mcp_connector_catalog',
        );
        setConnectorCatalog(
          catalogData.map((entry) => ({ ...entry, tools: [] })),
        );
      } catch (error) {
        setErrorFetchingConnectorCatalog(error as string);
      } finally {
        setLoadingConnectorCatalog(false);
      }
    })();
  }, []);

  const installMcpServerFromConnectorCatalog = useCallback(
    async (mcpServer: ConnectorCatalogEntry) => {
      const { oauth, title, id } = mcpServer;

      try {
        setInstallingMcpServerName(mcpServer.title);

        // Check if OAuth is required
        if (oauth?.required) {
          try {
            // Start OAuth flow
            await invoke('start_oauth_auth', { service: id });

            // For OAuth connectors, the backend will handle the installation after successful auth
            alert(
              `OAuth setup started for ${title}. Please complete the authentication in your browser.`,
            );
          } catch (error) {
            setErrorInstallingMcpServer(error as string);
          }
        } else {
          const result = await invoke<MCPServer>(
            'save_mcp_server_from_catalog',
            { connectorId: id },
          );

          console.log(`Installing MCP server ${title} from catalog`);
          console.log(`Result:`, result);

          setInstalledMCPServers((prev) => {
            console.log(`Previous state:`, prev);
            const newState = [
              ...prev,
              {
                ...result,
                url: constructProxiedMCPServerUrl(result.name),
                tools: [],
                client: null,
                status: 'connecting',
              },
            ] as ConnectedMCPServer[];
            console.log(`New state:`, newState);
            return newState;
          });
        }
      } catch (error) {
        setErrorInstallingMcpServer(error as string);
      } finally {
        setInstallingMcpServerName(null);
      }
    },
    [],
  );

  const uninstallMcpServer = useCallback(async (mcpServerName: string) => {
    (async () => {
      try {
        setUninstallingMcpServerName(mcpServerName);
        await invoke('uninstall_mcp_server', { name: mcpServerName });
        setInstalledMCPServers((prev) => {
          console.log(`Uninstalling MCP server ${mcpServerName}`);
          console.log(`Previous state:`, prev);
          const newState = prev.filter(
            (mcpServer) => mcpServer.name !== mcpServerName,
          );
          console.log(`New state:`, newState);
          return newState;
        });
      } catch (error) {
        setErrorUninstallingMcpServer(error as string);
      } finally {
        setUninstallingMcpServerName(null);
      }
    })();
  }, []);

  return {
    connectorCatalog,
    loadingConnectorCatalog,
    errorFetchingConnectorCatalog,
    installingMcpServerName,
    errorInstallingMcpServer,
    uninstallingMcpServerName,
    errorUninstallingMcpServer,
    installMcpServerFromConnectorCatalog,
    uninstallMcpServer,
  };
}
