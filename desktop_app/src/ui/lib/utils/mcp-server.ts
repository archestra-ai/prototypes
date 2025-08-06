import type { McpServerToolsMap, ToolWithMcpServerInfo } from '@ui/types';

export const getToolsGroupedByServer = (tools: ToolWithMcpServerInfo[]) => {
  return tools.reduce((acc, tool) => {
    acc[tool.server.slug] = [...(acc[tool.server.slug] || []), tool];
    return acc;
  }, {} as McpServerToolsMap);
};
