import { convertToModelMessages, stepCountIs, streamText } from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { ollama } from 'ollama-ai-provider-v2';

import Chat from '@backend/models/chat';

import { initMCP, mcpTools } from './index';

interface StreamRequestBody {
  model: string;
  messages: Array<any>;
  sessionId?: string;
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

const ollamaVercelRoutes: FastifyPluginAsync = async (fastify) => {
  // Initialize MCP if not already done
  if (!mcpTools) {
    fastify.log.info('Initializing MCP tools for Ollama Vercel...');
    await initMCP();
    fastify.log.info(`MCP tools initialized with ${mcpTools ? Object.keys(mcpTools).length : 0} tools`);
  } else {
    fastify.log.info(`MCP tools already available with ${Object.keys(mcpTools).length} tools`);
  }

  fastify.post<{ Body: StreamRequestBody }>(
    '/api/llm/ollama-vercel/stream',
    {
      schema: {
        operationId: 'streamOllamaVercelResponse',
        description: 'Stream Ollama response using Vercel AI SDK',
        tags: ['LLM', 'Ollama'],
      },
    },
    async (request: FastifyRequest<{ Body: StreamRequestBody }>, reply: FastifyReply) => {
      const { messages, sessionId, model = 'llama3.2:latest' } = request.body;

      try {
        // Use MCP tools if available
        const tools = mcpTools || {};

        // Create the stream with Vercel AI SDK
        const result = streamText({
          model: ollama(model),
          messages: convertToModelMessages(messages),
          tools: Object.keys(tools).length > 0 ? tools : undefined,
          // Optional: Enable thinking mode for supported models
          providerOptions: {
            ollama: {
              think: false, // Can be enabled for models that support thinking
            },
          },
        } as any);

        // Return UI-compatible stream response
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
        fastify.log.error('Ollama Vercel streaming error:', error);
        return reply.code(500).send({
          error: 'Failed to stream response',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
};

export default ollamaVercelRoutes;
