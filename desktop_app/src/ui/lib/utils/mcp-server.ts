import type { McpServerToolsMap, ToolWithMcpServerInfo } from '@ui/types';

export const getToolsGroupedByServer = (tools: ToolWithMcpServerInfo[]) => {
  return tools.reduce((acc, tool) => {
    acc[tool.server.name] = [...(acc[tool.server.name] || []), tool];
    return acc;
  }, {} as McpServerToolsMap);
};
