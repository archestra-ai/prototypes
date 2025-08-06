import { Tool as OllamaTool } from 'ollama/browser';

import { ToolWithMcpServerInfo } from '@ui/types';

import { convertServerAndToolNameToArchestraToolName } from './tools';

export const convertMcpServerToolsToOllamaTools = (tools: ToolWithMcpServerInfo[]): OllamaTool[] => {
  return tools.map(({ server, name, description, inputSchema }) => ({
    type: 'Function',
    function: {
      name: convertServerAndToolNameToArchestraToolName(server.name, name),
      description: description || `Tool from ${server.name}`,
      parameters: inputSchema as OllamaTool['function']['parameters'],
    },
  }));
};
