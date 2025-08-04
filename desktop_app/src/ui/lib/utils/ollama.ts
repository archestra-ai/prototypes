import { Tool as OllamaTool } from 'ollama/browser';

import { ToolWithMCPServerName } from '@types';

import { convertServerAndToolNameToArchestraToolName } from './tools';

export const convertMCPServerToolsToOllamaTools = (tools: ToolWithMCPServerName[]): OllamaTool[] => {
  return tools.map(({ serverName, name, description, inputSchema }) => ({
    type: 'Function',
    function: {
      name: convertServerAndToolNameToArchestraToolName(serverName, name),
      description: description || `Tool from ${serverName}`,
      parameters: inputSchema as OllamaTool['function']['parameters'],
    },
  }));
};
