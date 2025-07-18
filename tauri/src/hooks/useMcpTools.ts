import { useState, useEffect } from 'react';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

interface McpTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export function useMcpTools() {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mcpClient, setMcpClient] = useState<Client | null>(null);

  useEffect(() => {
    const connectAndLoadTools = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Wait for MCP sidecar to start up
        console.log('Waiting for MCP sidecar to start...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Create StreamableHTTP transport
        console.log('Connecting to MCP server via StreamableHTTP...');
        const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3001'));
        const client = new Client(
          {
            name: 'tauri-mcp-client',
            version: '1.0.0',
          },
          {
            capabilities: {},
          }
        );

        await client.connect(transport);
        console.log('MCP client connected successfully');
        
        setMcpClient(client);
        
        // List available tools
        const toolsResult = await client.listTools();
        console.log('MCP tools response:', toolsResult);
        
        const adaptedTools: McpTool[] = toolsResult.tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema || {
            type: 'object',
            properties: {},
            required: [],
          },
        }));
        
        setTools(adaptedTools);
        setError(null);
        console.log(`Loaded ${adaptedTools.length} MCP tools:`, adaptedTools);
      } catch (err) {
        console.error('Failed to connect to MCP server:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect to MCP server');
        setTools([]);
      } finally {
        setIsLoading(false);
      }
    };

    connectAndLoadTools();
  }, []);

  const callTool = async (name: string, arguments_: Record<string, any>) => {
    if (!mcpClient) {
      throw new Error('MCP client not connected');
    }
    
    try {
      const result = await mcpClient.callTool({
        name,
        arguments: arguments_,
      });
      
      return result;
    } catch (err) {
      console.error(`Failed to call tool ${name}:`, err);
      throw err;
    }
  };

  return {
    tools,
    isLoading,
    error,
    hasTools: tools.length > 0,
    callTool,
    mcpClient,
  };
}