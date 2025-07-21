import { useEffect, useState } from 'react';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const ARCHESTRA_SERVER_BASE_URL = "http://127.0.0.1:54587";
const ARCHESTRA_MCP_SERVER_URL = `${ARCHESTRA_SERVER_BASE_URL}/mcp`;

export function useArchestraMcpServer() {
  const [mcpClient, setMcpClient] = useState<Client | null>(null);

  const [archestraMcpServerStatus, setArchestraMcpServerStatus] = useState<"loading" | "running" | "error">("loading");

  const [archestraMcpServerTools, setArchestraMcpServerTools] = useState<Tool[]>([]);
  const [isLoadingArchestraMcpServerTools, setIsLoadingArchestraMcpServerTools] = useState(true);
  const [errorLoadingArchestraMcpServerTools, setErrorLoadingArchestraMcpServerTools] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const client = new Client({
        name: "archestra-desktop-app-mcp-client",
        version: "1.0.0"
      });
      const transport = new StreamableHTTPClientTransport(
        new URL(ARCHESTRA_MCP_SERVER_URL)
      );
      client.connect(transport);

      setMcpClient(client);
    })();
  }, []);

  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const response = await fetch(`${ARCHESTRA_SERVER_BASE_URL}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });

        if (response.ok) {
          setArchestraMcpServerStatus("running");
        } else {
          setArchestraMcpServerStatus("error");
        }
      } catch (error) {
        setArchestraMcpServerStatus("error");
      }
    };

    // Check server status on mount and periodically
    checkServerStatus();
    const serverHealthCheckInterval = setInterval(checkServerStatus, 5000);

    return () => {
      clearInterval(serverHealthCheckInterval);
    };
  }, []);

  // Recursively fetch archestra mcp server tools every 3 seconds until we get back tools
  useEffect(() => {
    if (!mcpClient || archestraMcpServerTools.length > 0) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        setIsLoadingArchestraMcpServerTools(true);

        const { tools } = await mcpClient.listTools();
        setArchestraMcpServerTools(tools);
      } catch (error) {
        setErrorLoadingArchestraMcpServerTools(error as string);
      } finally {
        setIsLoadingArchestraMcpServerTools(false);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [mcpClient, archestraMcpServerTools]);

  return {
    ARCHESTRA_MCP_SERVER_URL,
    mcpClient,
    archestraMcpServerStatus,
    archestraMcpServerTools,
    isLoadingArchestraMcpServerTools,
    errorLoadingArchestraMcpServerTools,
  };
}
