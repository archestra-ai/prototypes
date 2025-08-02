import type { MCPServerToolsMap, ToolWithMCPServerName } from '@ui/types';

export const getToolsGroupedByServer = (tools: ToolWithMCPServerName[]) => {
  return tools.reduce((acc, tool) => {
    acc[tool.serverName] = [...(acc[tool.serverName] || []), tool];
    return acc;
  }, {} as MCPServerToolsMap);
};
