import { Tool as OllamaTool } from 'ollama/browser';

import { ToolWithMCPServerName } from '@/types';

import { convertServerAndToolNameToArchestraToolName } from './tools';

// Converts MCP tools to format compatible with ollama_rs crate's ToolInfo struct
// Which is used by Archestra Proxy
export const convertMCPServerToolsToOllamaTools = (tools: ToolWithMCPServerName[]): any[] => {
  return tools.map(({ serverName, name, description, inputSchema }) => ({
    type: 'Function',
    function: {
      name: convertServerAndToolNameToArchestraToolName(serverName, name),
      description: description || `Tool from ${serverName}`,
      parameters: inputSchema,
    },
  }));
};
