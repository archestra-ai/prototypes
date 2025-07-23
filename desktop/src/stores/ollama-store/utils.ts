import { Tool as OllamaTool } from 'ollama/browser';

import type { ToolContext } from '../../components/kibo/ai-input';
import type { MCPServerTools } from '../mcp-servers-store';

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

export const convertMCPServerToolsToOllamaTools = (mcpServerTools: MCPServerTools): OllamaTool[] => {
  return Object.entries(mcpServerTools).flatMap(([serverName, tools]) =>
    tools.map((tool) => ({
      type: 'function',
      function: {
        name: convertServerAndToolNameToOllamaToolName(serverName, tool.name),
        description: tool.description || `Tool from ${serverName}`,
        parameters: tool.inputSchema as OllamaTool['function']['parameters'],
      },
    }))
  );
};

export const convertSelectedOrAllToolsToOllamaTools = (
  selectedTools: ToolContext[] | undefined,
  allTools: MCPServerTools
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
