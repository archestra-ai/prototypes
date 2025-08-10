import { createOpenAI, openai } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { convertToModelMessages, experimental_createMCPClient, stepCountIs, streamText } from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import Chat from '@backend/models/chat';
import CloudProviderModel from '@backend/models/cloudProvider';

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
  try {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL + '/mcp'));

    /**
     * TODO: fix type error here...
     */
    mcpClient = await experimental_createMCPClient({
      transport: transport as any, // Will be replaced by real MCP integration
    });

    // Get available tools from MCP server
    mcpTools = await mcpClient.tools();

    return true;
  } catch (error: any) {
    mcpClient = null;
    mcpTools = null;
    return false;
  }
}

const llmRoutes: FastifyPluginAsync = async (fastify) => {
  // Initialize MCP on startup
  const mcpConnected = await initMCP();

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
        // Check if it's a cloud provider model
        const providerConfig = await CloudProviderModel.getProviderConfigForModel(model);

        let client;
        if (providerConfig) {
          // Use cloud provider configuration
          client = createOpenAI({
            apiKey: providerConfig.apiKey,
            baseURL: providerConfig.provider.baseUrl,
            headers: providerConfig.provider.headers,
          });
        } else {
          // Default OpenAI client (for backward compatibility)
          client = openai;
        }

        // Use MCP tools directly from Vercel AI SDK
        const tools = mcpTools || {};

        // Create the stream with the appropriate client
        const streamConfig = {
          model: client(model),
          messages: convertToModelMessages(messages),
          tools: Object.keys(tools).length > 0 ? tools : undefined,
          maxSteps: 5, // Allow multiple tool calls
          stopWhen: stepCountIs(5),
          // experimental_transform: smoothStream({
          //   delayInMs: 20, // optional: defaults to 10ms
          //   chunking: 'line', // optional: defaults to 'word'
          // }),
          // onError({ error }) {
          // },
        };

        const result = streamText(streamConfig);

        return reply.send(
          result.toUIMessageStreamResponse({
            originalMessages: messages,
            onFinish: ({ messages: finalMessages }) => {
              if (sessionId) {
                Chat.saveMessages(sessionId, finalMessages);
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
      } catch (error) {
        // Silent cleanup
      }
    }
  });
};

export default llmRoutes;
