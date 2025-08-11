import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { experimental_createMCPClient, streamText } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';

async function main() {
  // Initialize MCP connection directly
  console.log('Initializing MCP tools...');

  let mcpTools: any = null;

  try {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL + '/mcp'));

    const mcpClient = await experimental_createMCPClient({
      transport: transport as any,
    });

    // Get available tools from MCP server
    mcpTools = await mcpClient.tools();

    console.log(`MCP tools available: ${Object.keys(mcpTools).length}`);
    console.log('Tools:', Object.keys(mcpTools));
  } catch (error) {
    console.error('Failed to initialize MCP tools:', error);
    return;
  }

  const ollama = createOllama({ baseURL: 'http://localhost:50661/api' });

  const result = streamText({
    model: ollama('qwen3:8b'),
    messages: [{ role: 'user', content: 'Call the printEnv function' }],
    tools: mcpTools, // Use actual MCP tools from MCP server
    toolChoice: 'required', // Force the model to use a tool
    maxSteps: 3, // Allow multiple tool calls
  });

  console.log('\nStreaming response...\n');

  for await (const chunk of result.fullStream) {
    console.log(chunk);
  }

  console.log('\n\nDone!');
}

main().catch(console.error);
