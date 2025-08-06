import { openai } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { convertToModelMessages, experimental_createMCPClient, stepCountIs, streamText } from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { chatService } from '@backend/models/chat';

interface StreamRequestBody {
  model: string;
  messages: Array<any>;
  sessionId?: string;
}

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';

// MCP client using Vercel AI SDK
let mcpClient: any = null;
export let mcpTools: any = null;

// Initialize MCP connection using Vercel AI SDK
export async function initMCP() {
  console.log(`Initializing MCP server connection to ${MCP_SERVER_URL}...`);
  try {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL + '/mcp'));

    console.log('Creating MCP client...');
    mcpClient = await experimental_createMCPClient({
      transport,
    });

    console.log('Connected to MCP server successfully');

    // Get available tools from MCP server
    mcpTools = await mcpClient.tools();
    console.log(`Found ${Object.keys(mcpTools).length} tools:`, Object.keys(mcpTools).join(', '));

    return true;
  } catch (error: any) {
    console.error('Failed to connect to MCP server:', error.message || error);
    console.log('MCP features will be disabled. To enable:');
    console.log('1. Ensure MCP server is running on', MCP_SERVER_URL);
    console.log('2. Or set MCP_SERVER_URL environment variable');
    mcpClient = null;
    mcpTools = null;
    return false;
  }
}

const llmRoutes: FastifyPluginAsync = async (fastify) => {
  // Initialize MCP on startup
  const mcpConnected = await initMCP();

  // Log available tools
  if (mcpTools && Object.keys(mcpTools).length > 0) {
    fastify.log.info('Available MCP tools:');
    Object.entries(mcpTools).forEach(([name, tool]) => {
      fastify.log.info(`  - ${name}: ${(tool as any).description || 'No description'}`);
    });
  }

  // Add test endpoint for MCP status
  fastify.get('/api/mcp/test', async (request, reply) => {
    return reply.send({
      connected: mcpConnected,
      serverUrl: MCP_SERVER_URL,
      toolCount: mcpTools ? Object.keys(mcpTools).length : 0,
      tools: mcpTools
        ? Object.entries(mcpTools).map(([name, tool]) => ({
            name,
            description: (tool as any).description,
          }))
        : [],
    });
  });
  // Based on this doc: https://ai-sdk.dev/docs/ai-sdk-core/generating-text
  fastify.post<{ Body: StreamRequestBody }>(
    '/api/llm/openai/stream',
    {
      schema: {
        operationId: 'streamLlmResponse',
        description: 'Stream LLM response',
        tags: ['LLM'],
      },
    },
    async (request: FastifyRequest<{ Body: StreamRequestBody }>, reply: FastifyReply) => {
      const { messages, sessionId, model = 'gpt-4o' } = request.body;

      try {
        // Use MCP tools directly from Vercel AI SDK
        const tools = mcpTools || {};

        if (!mcpTools || Object.keys(tools).length === 0) {
          fastify.log.info('MCP tools not available - running without tools');
        } else {
          fastify.log.info(`Using ${Object.keys(tools).length} MCP tools from Vercel AI SDK`);
        }

        // Create the stream
        const streamConfig = {
          model: openai(model),
          messages: convertToModelMessages(messages),
          tools: Object.keys(tools).length > 0 ? tools : undefined,
          maxSteps: 5, // Allow multiple tool calls
          stopWhen: stepCountIs(5),
          // experimental_transform: smoothStream({
          //   delayInMs: 20, // optional: defaults to 10ms
          //   chunking: 'line', // optional: defaults to 'word'
          // }),
          // onError({ error }) {
          //   console.error(error); // your error logging logic here
          // },
        };

        fastify.log.info(`Starting LLM stream with ${Object.keys(tools).length} tools`);

        const result = streamText(streamConfig);

        return reply.send(
          result.toUIMessageStreamResponse({
            originalMessages: messages,
            onFinish: ({ messages: finalMessages }) => {
              fastify.log.info(`\n📝 Chat finished with ${finalMessages.length} messages`);

              // Log tool invocations in final messages
              finalMessages.forEach((msg: any) => {
                if (msg.toolInvocations && msg.toolInvocations.length > 0) {
                  fastify.log.info(`Message ${msg.id} had ${msg.toolInvocations.length} tool invocations`);
                }
              });

              if (sessionId) {
                chatService.saveMessages(sessionId, finalMessages);
              }
            },
          })
        );
      } catch (error) {
        fastify.log.error('LLM streaming error:', error);
        return reply.code(500).send({
          error: 'Failed to stream response',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Cleanup MCP client on server shutdown
  fastify.addHook('onClose', async () => {
    if (mcpClient) {
      try {
        await mcpClient.close();
        console.log('MCP client closed');
      } catch (error) {
        console.error('Error closing MCP client:', error);
      }
    }
  });
};

export default llmRoutes;
