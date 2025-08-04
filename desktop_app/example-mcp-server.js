import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Create MCP server
const server = new Server({
  name: 'example-mcp-server',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

// Add a simple tool
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [{
      name: 'get_time',
      description: 'Get the current time',
      inputSchema: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Timezone (e.g., America/New_York)',
          },
        },
      },
    }, {
      name: 'echo',
      description: 'Echo back the input',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Message to echo',
          },
        },
        required: ['message'],
      },
    }],
  };
});

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case 'get_time':
      const timezone = args.timezone || 'UTC';
      const time = new Date().toLocaleString('en-US', { timeZone: timezone });
      return {
        result: {
          time,
          timezone,
        },
      };
      
    case 'echo':
      return {
        result: {
          echoed: args.message,
          timestamp: new Date().toISOString(),
        },
      };
      
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start HTTP server
const transport = new StreamableHTTPServerTransport({
  port: 3001,
  path: '/', // This is important - it needs to handle root path
});

await server.connect(transport);
console.log('MCP server running on http://localhost:3001');
console.log('Available tools: get_time, echo');