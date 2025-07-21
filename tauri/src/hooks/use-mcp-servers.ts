import { useEffect, useState, useCallback } from 'react';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ClientCapabilities, CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { fetch } from '@tauri-apps/plugin-http';
import { invoke } from '@tauri-apps/api/core';

import type { MCPServer, MCPServerStatusAndError, MCPServerWithClientAndToolsAndStatus } from '../types';


const configureMCPClient = async (
  clientName: string,
  clientUrl: string,
  clientCapabilities: ClientCapabilities
): Promise<Client | null> => {
  const client = new Client({
    name: clientName,
    version: "1.0.0"
  }, {
    capabilities: clientCapabilities,
  });

  const transport = new StreamableHTTPClientTransport(new URL(clientUrl), {
    fetch: fetch
  });

  console.log(`Configuring MCP client: ${clientName} at ${clientUrl}`);
  await client.connect(transport);
  console.log(`MCP client ${clientName} connected to ${clientUrl}`);

  return client;
};


export function useMCPServers() {
  const [archestraMCPServer, setArchestraMCPServer] = useState<MCPServerWithClientAndToolsAndStatus>({
    name: "Archestra",
    url: "http://127.0.0.1:54587/mcp",
    client: null,
    tools: [],
    status: 'connecting',
    error: undefined,
  });

  const [installedMCPServers, setInstalledMCPServers] = useState<MCPServerWithClientAndToolsAndStatus[]>([]);
  const [loadingInstalledMCPServers, setLoadingInstalledMCPServers] = useState(false);
  const [errorLoadingInstalledMCPServers, setErrorLoadingInstalledMCPServers] = useState<string | null>(null);

  /**
   * Load the installed MCP servers
   */
  useEffect(() => {
    (async () => {
      try {
        setLoadingInstalledMCPServers(true);
        const installedMCPServers = await invoke<MCPServer[]>("load_installed_mcp_servers");
        setInstalledMCPServers(installedMCPServers.map((mcpServer) => ({
          ...mcpServer,
          tools: [],
          status: 'connecting',
          error: undefined,
          client: null,
        })));
      } catch (error) {
        setErrorLoadingInstalledMCPServers(error as string);
      } finally {
        setLoadingInstalledMCPServers(false);
      }
    })();
  }, []);

  const connectToMCPServer = useCallback(async (serverName: string, url: string) => {
    try {
      const client = await configureMCPClient(
        `${serverName}-client`,
        url,
        {
          tools: {}
        }
      );

      if (!client) {
        return;
      }

      // List available tools
      console.log(`Listing tools for ${serverName}...`);
      const { tools } = await client.listTools();
      console.log(`Found ${tools.length} tools for ${serverName}:`, tools);

      setInstalledMCPServers(prev => prev.map(server =>
        server.name === serverName
          ? { ...server, client, tools, status: 'connected' }
          : server
      ));

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

      setInstalledMCPServers(prev => prev.map(server =>
        server.name === serverName
          ? { ...server, client: null, status: 'error', error: errorMessage }
          : server
      ));
      return null;
    }
  }, []);

  const pingMCPServer = useCallback(async (serverName: string) => {
    let server: MCPServerWithClientAndToolsAndStatus | undefined;
    if (serverName === "archestra") {
      server = archestraMCPServer;
    } else {
      server = installedMCPServers.find(s => s.name === serverName);
    }

    if (!server?.client) {
      throw new Error(`No connection to server ${serverName}`);
    }

    try {
      const pingResponse = await server.client.ping();
      console.log(`${serverName} MCP server is running:`, pingResponse);

      if (serverName === "archestra") {
        setArchestraMCPServer(prev => ({
          ...prev,
          status: 'connected',
          error: undefined,
        }));
      } else {
        setInstalledMCPServers(prev => prev.map(s =>
          s.name === serverName
            ? { ...s, status: 'connected' }
            : s
        ));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorInfo: MCPServerStatusAndError = { status: 'error', error: errorMessage };

      if (serverName === "archestra") {
        setArchestraMCPServer(prev => ({ ...prev, ...errorInfo }));
      } else {
        setInstalledMCPServers(prev => prev.map(s =>
          s.name === serverName
            ? { ...s, ...errorInfo }
            : s
        ));
      }
    }
  }, [archestraMCPServer, installedMCPServers]);

  const executeTool = useCallback(async (
    serverName: string,
    toolCallRequest: CallToolRequest["params"]
  ) => {
    let server: MCPServerWithClientAndToolsAndStatus | undefined;
    if (serverName === "archestra") {
      server = archestraMCPServer;
    } else {
      server = installedMCPServers.find(s => s.name === serverName);
    }

    if (!server?.client) {
      throw new Error(`No connection to server ${serverName}`);
    }

    try {
      const result = await server.client.callTool(toolCallRequest);
      return result;
    } catch (error) {
      console.error(`Failed to execute tool ${toolCallRequest.name} on ${serverName}:`, error);
      throw error;
    }
  }, [archestraMCPServer, installedMCPServers]);

  const initializeMCPServers = useCallback(async () => {
    /**
     * Connect to the archestra MCP server + all installed MCP servers, in parallel
     */
    const connectionPromises = installedMCPServers.map(server =>
      connectToMCPServer(server.name, server.url)
    );
    connectionPromises.push(connectToMCPServer(archestraMCPServer.name, archestraMCPServer.url));

    await Promise.allSettled(connectionPromises);

    /**
     * Periodically ping the servers to check their status
     */
    const archestraMCPServerStatusCheckInterval = setInterval(() => pingMCPServer("archestra"), 5000);
    const installedMCPServerStatusCheckIntervals = installedMCPServers.map(server => {
      const statusCheckInterval = setInterval(() => pingMCPServer(server.name), 5000);
      return () => clearInterval(statusCheckInterval);
    });

    return () => {
      clearInterval(archestraMCPServerStatusCheckInterval);
      installedMCPServerStatusCheckIntervals.forEach(interval => interval());
    };
  }, [connectToMCPServer, pingMCPServer]);

  /**
   * Initialize the MCP servers
   */
  useEffect(() => {
    initializeMCPServers();

    // Cleanup function to disconnect clients
    return () => {
      archestraMCPServer.client?.close();
      installedMCPServers.forEach(server => server.client?.close());
    };
  }, []);

  return {
    archestraMCPServer,
    installedMCPServers,
    loadingInstalledMCPServers,
    errorLoadingInstalledMCPServers,
    setInstalledMCPServers,
    connectToMCPServer,
    executeTool,
  };
}
