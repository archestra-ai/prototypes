import { Tool as OllamaTool } from 'ollama/browser';

import { ToolWithMCPServerName } from '@/types';

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
