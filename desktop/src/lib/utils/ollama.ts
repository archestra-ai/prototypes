import { Tool as OllamaTool } from 'ollama/browser';

import { MCPServerToolsMap, ToolWithMCPServerName } from '@/types';

export const convertServerAndToolNameToOllamaToolName = (serverName: string, toolName: string): string =>
  `${serverName}_${toolName}`;

export const convertOllamaToolNameToServerAndToolName = (ollamaToolName: string) => {
  const firstUnderscoreIndex = ollamaToolName.indexOf('_');
  if (firstUnderscoreIndex === -1) {
    throw new Error(`Invalid tool name format: ${ollamaToolName}. Expected format: serverName_toolName`);
  }
  return [ollamaToolName.slice(0, firstUnderscoreIndex), ollamaToolName.slice(firstUnderscoreIndex + 1)] as [
    string,
    string,
  ];
};

export const convertMCPServerToolsToOllamaTools = (tools: ToolWithMCPServerName[]): OllamaTool[] => {
  return tools.map(({ serverName, name, description, inputSchema }) => ({
    type: 'function',
    function: {
      name: convertServerAndToolNameToOllamaToolName(serverName, name),
      description: description || `Tool from ${serverName}`,
      parameters: inputSchema as OllamaTool['function']['parameters'],
    },
  }));
};

export const convertToolsToOllamaTools = (
  tools: ToolWithMCPServerName[],
  allTools: MCPServerToolsMap
): OllamaTool[] => {
  // If no tools are selected, return all tools (current behavior)
  if (!selectedTools || selectedTools.length === 0) {
    return convertMCPServerToolsToOllamaTools(allTools);
  }

  // Filter allTools to only include selected tools
  const filteredTools: MCPServerTools = {};

  for (const selectedTool of selectedTools) {
    const serverTools = allTools[selectedTool.serverName];
    if (serverTools) {
      const matchingTool = serverTools.find((tool) => tool.name === selectedTool.toolName);
      if (matchingTool) {
        if (!filteredTools[selectedTool.serverName]) {
          filteredTools[selectedTool.serverName] = [];
        }
        filteredTools[selectedTool.serverName].push(matchingTool);
      }
    }
  }

  return convertMCPServerToolsToOllamaTools(filteredTools);
};
