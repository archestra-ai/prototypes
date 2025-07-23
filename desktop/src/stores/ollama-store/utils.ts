import { Tool as OllamaTool } from 'ollama/browser';

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
