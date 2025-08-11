import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { convertToModelMessages, experimental_createMCPClient, stepCountIs, streamText } from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import Chat from '@backend/models/chat';
import CloudProviderModel from '@backend/models/cloudProvider';

import { handleOllamaStream } from './ollama-stream-handler';

interface StreamRequestBody {
  model: string;
  messages: Array<any>;
  sessionId?: string;
  provider?: string;
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
      const { messages, sessionId, model = 'gpt-4o', provider } = request.body;

      try {
        // Handle Ollama provider separately
        if (provider === 'ollama') {
          return handleOllamaStream(fastify, request, reply, mcpTools);
        }
        // Check if it's a cloud provider model
        const providerConfig = await CloudProviderModel.getProviderConfigForModel(model);

        let modelInstance;
        if (providerConfig) {
          // Check provider type and use appropriate client
          if (providerConfig.provider.type === 'gemini') {
            // Use Google Generative AI client for Gemini
            const googleClient = createGoogleGenerativeAI({
              apiKey: providerConfig.apiKey,
              baseURL: providerConfig.provider.baseUrl,
            });
            modelInstance = googleClient(model);
          } else if (providerConfig.provider.type === 'anthropic') {
            // Use Anthropic client for Claude
            const anthropicClient = createAnthropic({
              apiKey: providerConfig.apiKey,
              baseURL: providerConfig.provider.baseUrl,
            });
            modelInstance = anthropicClient(model);
          } else if (providerConfig.provider.type === 'deepseek') {
            const deepseekClient = createDeepSeek({
              apiKey: providerConfig.apiKey,
              baseURL: providerConfig.provider.baseUrl || 'https://api.deepseek.com/v1',
              // headers: providerConfig.provider.headers,
            });
            modelInstance = deepseekClient(model);
          } else {
            // Use OpenAI-compatible client for other providers
            const openaiClient = createOpenAI({
              apiKey: providerConfig.apiKey,
              baseURL: providerConfig.provider.baseUrl,
              headers: providerConfig.provider.headers,
            });
            modelInstance = openaiClient(model);
          }
        } else {
          // Default OpenAI client (for backward compatibility)
          modelInstance = openai(model);
        }

        // Use MCP tools directly from Vercel AI SDK
        const tools = mcpTools || {};

        // Create the stream with the appropriate model
        const streamConfig = {
          model: modelInstance,
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
