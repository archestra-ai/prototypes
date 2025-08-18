import { create } from 'zustand';

import { getAvailableTools } from '@ui/lib/clients/archestra/api/gen';
import type { AvailableToolsMap, Tool, ToolChoice, ToolsByServer } from '@ui/types/tools';

const AVAILABLE_TOOLS_REFETCH_INTERVAL = 5000;

interface ToolsState {
  availableTools: Tool[];
  loadingAvailableTools: boolean;
  errorLoadingAvailableTools: Error | null;
  selectedToolIds: Set<string>;
  toolChoice: ToolChoice;
}

interface ToolsActions {
  addSelectedTool: (toolId: string) => void;
  removeSelectedTool: (toolId: string) => void;
  setToolChoice: (choice: ToolChoice) => void;
  getToolsByServerName: () => ToolsByServer;
  getAvailableToolsMap: () => AvailableToolsMap;
  _periodicallyFetchAvailableTools: () => void;
}

type ToolsStore = ToolsState & ToolsActions;

export const useToolsStore = create<ToolsStore>((set, get) => ({
  // State
  availableTools: [],
  loadingAvailableTools: true,
  errorLoadingAvailableTools: null,
  selectedToolIds: new Set(),
  toolChoice: 'auto',

  // Actions
  addSelectedTool: (toolId: string) => {
    set(({ selectedToolIds }) => ({
      selectedToolIds: selectedToolIds.add(toolId),
    }));
  },

  removeSelectedTool: (toolId: string) => {
    set(({ selectedToolIds }) => {
      selectedToolIds.delete(toolId);

      return {
        selectedToolIds,
      };
    });
  },

  setToolChoice: (choice: 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string }) => {
    set({ toolChoice: choice });
  },

  getToolsByServerName: () => {
    return get().availableTools.reduce((acc: ToolsByServer, tool: Tool) => {
      const serverName = tool.mcpServerName || 'Unknown';
      if (!acc[serverName]) {
        acc[serverName] = [];
      }
      acc[serverName].push(tool);
      return acc;
    }, {});
  },

  getAvailableToolsMap: () => {
    return get().availableTools.reduce((acc, tool) => {
      acc[tool.id] = tool;
      return acc;
    }, {} as AvailableToolsMap);
  },

  _periodicallyFetchAvailableTools: () => {
    set({ loadingAvailableTools: true });

    const fetchTools = async () => {
      const { data } = await getAvailableTools();
      set({ availableTools: data, loadingAvailableTools: false });
    };

    fetchTools();

    const interval = setInterval(fetchTools, AVAILABLE_TOOLS_REFETCH_INTERVAL);
    return () => clearInterval(interval);
  },
}));

useToolsStore.getState()._periodicallyFetchAvailableTools();
