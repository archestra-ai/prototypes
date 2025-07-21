import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ClientCapabilities,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { fetch } from '@tauri-apps/plugin-http';
import { invoke } from '@tauri-apps/api/core';

import type { MCPServer, ConnectedMCPServer } from '../types';

const ARCHESTRA_SERVER_URL = 'http://localhost:54587';
const ARCHESTRA_SERVER_MCP_URL = `${ARCHESTRA_SERVER_URL}/mcp`;

interface MCPServersContextType {
  archestraMCPServer: ConnectedMCPServer;
  installedMCPServers: ConnectedMCPServer[];
  loadingInstalledMCPServers: boolean;
  errorLoadingInstalledMCPServers: string | null;
  addMCPServerToInstalledMCPServers: (mcpServer: MCPServer) => void;
  removeMCPServerFromInstalledMCPServers: (mcpServerName: string) => void;
  executeTool: (
    serverName: string,
    request: CallToolRequest['params'],
  ) => Promise<any>;
}

const MCPServersContext = createContext<MCPServersContextType | undefined>(
  undefined,
);

const configureMCPClient = async (
  clientName: string,
  clientUrl: string,
  clientCapabilities: ClientCapabilities,
): Promise<Client | null> => {
  const client = new Client(
    {
      name: clientName,
      version: '1.0.0',
    },
    {
      capabilities: clientCapabilities,
    },
  );

  const transport = new StreamableHTTPClientTransport(new URL(clientUrl), {
    fetch: fetch,
  });

  console.log(`Configuring MCP client: ${clientName} at ${clientUrl}`);
  await client.connect(transport);
  console.log(`MCP client ${clientName} connected to ${clientUrl}`);

  return client;
};

export function constructProxiedMCPServerUrl(mcpServerName: string) {
  return `${ARCHESTRA_SERVER_URL}/proxy/${mcpServerName}`;
}

export function MCPServersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [archestraMCPServer, setArchestraMCPServer] =
    useState<ConnectedMCPServer>({
      name: 'Archestra',
      url: ARCHESTRA_SERVER_MCP_URL,
      client: null,
      tools: [],
      status: 'connecting',
      error: undefined,
    });

  const [installedMCPServers, setInstalledMCPServers] = useState<
    ConnectedMCPServer[]
  >([]);
  const [loadingInstalledMCPServers, setLoadingInstalledMCPServers] =
    useState(false);
  const [errorLoadingInstalledMCPServers, setErrorLoadingInstalledMCPServers] =
    useState<string | null>(null);

  const addMCPServerToInstalledMCPServers = useCallback(
    (mcpServer: MCPServer) => {
      setInstalledMCPServers((prev) => [
        ...prev,
        {
          ...mcpServer,
          tools: [],
          url: constructProxiedMCPServerUrl(mcpServer.name),
          status: 'connecting',
          error: undefined,
          client: null,
        },
      ]);
    },
    [],
  );

  const removeMCPServerFromInstalledMCPServers = useCallback(
    (mcpServerName: string) => {
      setInstalledMCPServers((prev) =>
        prev.filter((mcpServer) => mcpServer.name !== mcpServerName),
      );
    },
    [],
  );

  /**
   * Load the installed MCP servers
   */
  useEffect(() => {
    (async () => {
      try {
        setLoadingInstalledMCPServers(true);
        const installedMCPServers = await invoke<MCPServer[]>(
          'load_installed_mcp_servers',
        );
        installedMCPServers.forEach(addMCPServerToInstalledMCPServers);
      } catch (error) {
        setErrorLoadingInstalledMCPServers(error as string);
      } finally {
        setLoadingInstalledMCPServers(false);
      }
    })();
  }, []);

  const connectToMCPServer = useCallback(
    async (serverName: string, url: string) => {
      console.log(`Connecting to MCP server ${serverName} at ${url}`);

      if (!url) {
        console.error(`No URL provided for MCP server ${serverName}`);
        setInstalledMCPServers((prev) =>
          prev.map((server) =>
            server.name === serverName
              ? {
                  ...server,
                  client: null,
                  status: 'error',
                  error: 'No URL configured',
                }
              : server,
          ),
        );
        return null;
      }

      try {
        const client = await configureMCPClient(`${serverName}-client`, url, {
          tools: {},
        });

        if (!client) {
          return;
        }

        // List available tools
        console.log(`Listing tools for ${serverName}...`);
        const { tools } = await client.listTools();
        console.log(`Found ${tools.length} tools for ${serverName}:`, tools);

        setInstalledMCPServers((prev) =>
          prev.map((server) =>
            server.name === serverName
              ? { ...server, client, tools, status: 'connected' }
              : server,
          ),
        );

        return client;
      } catch (error) {
        console.error(`Failed to connect to MCP server ${serverName}:`, error);

        // Extract more detailed error information
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
          errorMessage = error.message;
          if (error.message.includes('HTTP 500')) {
            errorMessage = `Server error (500) - possible JSON-RPC format issue`;
          }
        }

        setInstalledMCPServers((prev) =>
          prev.map((server) =>
            server.name === serverName
              ? {
                  ...server,
                  client: null,
                  status: 'error',
                  error: errorMessage,
                }
              : server,
          ),
        );
        return null;
      }
    },
    [],
  );

  const executeTool = useCallback(
    async (serverName: string, toolCallRequest: CallToolRequest['params']) => {
      let client: Client | null = null;
      if (serverName === 'archestra') {
        client = archestraMCPServer.client;
      } else {
        const server = installedMCPServers.find((s) => s.name === serverName);
        client = server?.client || null;
      }

      if (!client) {
        throw new Error(`No connection to server ${serverName}`);
      }

      try {
        const result = await client.callTool(toolCallRequest);
        return result;
      } catch (error) {
        console.error(
          `Failed to execute tool ${toolCallRequest.name} on ${serverName}:`,
          error,
        );
        throw error;
      }
    },
    [],
  );

  /**
   * Connect to Archestra MCP server on mount
   */
  useEffect(() => {
    (async () => {
      try {
        const client = await configureMCPClient(
          'Archestra-client',
          archestraMCPServer.url,
          { tools: {} },
        );

        if (client) {
          const { tools } = await client.listTools();
          console.log(`Found ${tools.length} tools for Archestra:`, tools);

          setArchestraMCPServer((prev) => ({
            ...prev,
            client,
            tools,
            status: 'connected',
            error: undefined,
          }));
        }
      } catch (error) {
        console.error('Failed to connect to Archestra MCP server:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setArchestraMCPServer((prev) => ({
          ...prev,
          status: 'error',
          error: errorMessage,
        }));
      }
    })();

    return () => {
      archestraMCPServer.client?.close();
    };
  }, []);

  /**
   * Connect to installed MCP servers after they're loaded
   */
  useEffect(() => {
    if (installedMCPServers.length === 0) {
      return;
    }

    (async () => {
      const connectionPromises = installedMCPServers.map((server) =>
        connectToMCPServer(server.name, server.url),
      );

      await Promise.allSettled(connectionPromises);
    })();

    return () => {
      installedMCPServers.forEach((server) => server.client?.close());
    };
  }, [installedMCPServers.length]);

  const value: MCPServersContextType = {
    archestraMCPServer,
    installedMCPServers,
    loadingInstalledMCPServers,
    errorLoadingInstalledMCPServers,
    addMCPServerToInstalledMCPServers,
    removeMCPServerFromInstalledMCPServers,
    executeTool,
  };

  return (
    <MCPServersContext.Provider value={value}>
      {children}
    </MCPServersContext.Provider>
  );
}

export function useMCPServers() {
  const context = useContext(MCPServersContext);
  if (context === undefined) {
    throw new Error('useMCPServers must be used within a MCPServersProvider');
  }
  return context;
}
