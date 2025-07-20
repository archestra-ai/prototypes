import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { mcpClient, McpTool } from '../services/mcp-client';

export interface McpToolWithServer {
  serverName: string;
  tool: McpTool;
}

export function useMcpClient() {
  const [mcpTools, setMcpTools] = useState<McpToolWithServer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedServers, setConnectedServers] = useState<string[]>([]);

  // Load available MCP servers from the backend
  const loadMcpServers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get the list of running MCP servers from Tauri backend
      const servers = await invoke<Array<{ name: string }>>("load_mcp_servers");
      const serverNames = servers.map(s => s.name);
      
      // Connect to all servers
      await mcpClient.connectToAllServers(serverNames);
      
      // Get all tools
      const tools = mcpClient.getAllTools();
      const formattedTools = tools.map(([serverName, tool]) => ({
        serverName,
        tool,
      }));
      
      setMcpTools(formattedTools);
      setConnectedServers(serverNames);
    } catch (error) {
      console.error("Failed to load MCP tools:", error);
      setError(error instanceof Error ? error.message : 'Failed to load MCP tools');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Execute a tool
  const executeTool = useCallback(async (
    serverName: string,
    toolName: string,
    args: any
  ) => {
    try {
      const result = await mcpClient.executeTool(serverName, toolName, args);
      return result;
    } catch (error) {
      console.error(`Failed to execute tool ${toolName}:`, error);
      throw error;
    }
  }, []);

  // Refresh tools for a specific server
  const refreshServerTools = useCallback(async (serverName: string) => {
    try {
      await mcpClient.refreshServerTools(serverName);
      
      // Update the tools list
      const tools = mcpClient.getAllTools();
      const formattedTools = tools.map(([serverName, tool]) => ({
        serverName,
        tool,
      }));
      
      setMcpTools(formattedTools);
    } catch (error) {
      console.error(`Failed to refresh tools for ${serverName}:`, error);
      throw error;
    }
  }, []);

  // Get server connection status
  const getServerStatus = useCallback(() => {
    return mcpClient.getServerStatus();
  }, []);

  // Initial load
  useEffect(() => {
    loadMcpServers();
  }, [loadMcpServers]);

  // Listen for MCP server changes
  useEffect(() => {
    const unlisten = (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      
      return await listen('mcp-servers-changed', async () => {
        await loadMcpServers();
      });
    })();

    return () => {
      unlisten.then(fn => fn());
    };
  }, [loadMcpServers]);

  return {
    mcpTools,
    isLoading,
    error,
    connectedServers,
    executeTool,
    refreshServerTools,
    getServerStatus,
    reloadServers: loadMcpServers,
  };
}