import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { create } from 'zustand';

import { getToolsGroupedByServer } from '@ui/lib/utils/mcp-server';
import { formatToolName } from '@ui/lib/utils/tools';
import { McpServerToolsMap, ToolWithMcpServerInfo } from '@ui/types';

import { ARCHESTRA_MCP_SERVER_ID, useMcpServersStore } from './mcp-servers-store';

interface ToolsState {
  selectedTools: ToolWithMcpServerInfo[];
  toolSearchQuery: string;
}

interface ToolsActions {
  executeTool: (mcpServerId: string, request: CallToolRequest['params']) => Promise<any>;
  getAllAvailableTools: () => ToolWithMcpServerInfo[];
  getFilteredTools: () => ToolWithMcpServerInfo[];
  getAllAvailableToolsGroupedByServer: () => McpServerToolsMap;
  getFilteredToolsGroupedByServer: () => McpServerToolsMap;

  addSelectedTool: (tool: ToolWithMcpServerInfo) => void;
  removeSelectedTool: (tool: ToolWithMcpServerInfo) => void;

  setToolSearchQuery: (query: string) => void;
}

type ToolsStore = ToolsState & ToolsActions;

export const useToolsStore = create<ToolsStore>((set, get) => ({
  // State
  selectedTools: [],
  toolSearchQuery: '',

  // Actions
  executeTool: async (mcpServerId: string, toolCallRequest: CallToolRequest['params']) => {
    const { archestraMcpServer, installedMcpServers } = useMcpServersStore.getState();

    let client: Client | null = null;
    if (mcpServerId === ARCHESTRA_MCP_SERVER_ID && archestraMcpServer) {
      client = archestraMcpServer.client;
    } else {
      const server = installedMcpServers.find((s) => s.id === mcpServerId);
      client = server?.client || null;
    }

    if (!client) {
      throw new Error(`No connection to server ${mcpServerId}`);
    }

    try {
      const result = await client.callTool(toolCallRequest);
      return result;
    } catch (error) {
      throw error;
    }
  },

  getAllAvailableTools: () => {
    const { installedMcpServers } = useMcpServersStore.getState();
    return installedMcpServers.flatMap((server) => server.tools);
  },

  getFilteredTools: () => {
    const { toolSearchQuery, getAllAvailableTools } = get();
    const allAvailableTools = getAllAvailableTools();

    if (!toolSearchQuery.trim()) {
      return allAvailableTools;
    }

    const query = toolSearchQuery.toLowerCase();
    const filtered = allAvailableTools.filter(({ server, name, description }) => {
      const serverMatches = server.name.toLowerCase().includes(query);
      const toolNameMatches = name.toLowerCase().includes(query);
      const formattedNameMatches = formatToolName(name).toLowerCase().includes(query);
      const descriptionMatches = description?.toLowerCase().includes(query) || false;
      return serverMatches || toolNameMatches || formattedNameMatches || descriptionMatches;
    });

    return filtered;
  },

  getAllAvailableToolsGroupedByServer: () => getToolsGroupedByServer(get().getAllAvailableTools()),
  getFilteredToolsGroupedByServer: () => getToolsGroupedByServer(get().getFilteredTools()),

  addSelectedTool: (tool: ToolWithMcpServerInfo) => {
    set(({ selectedTools }) => {
      // if tool is not already in selectedTools, add it
      if (!selectedTools.some((t) => t.name === tool.name)) {
        return {
          selectedTools: [...selectedTools, tool],
        };
      }
      return { selectedTools };
    });
  },

  removeSelectedTool: (tool: ToolWithMcpServerInfo) => {
    set(({ selectedTools }) => ({
      selectedTools: selectedTools.filter((t) => t.name !== tool.name),
    }));
  },

  setToolSearchQuery: (query: string) => {
    set({ toolSearchQuery: query });
  },
}));
