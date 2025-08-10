import {
  UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
  stepCountIs,
  streamText,
} from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createOllama } from 'ollama-ai-provider-v2';

import Chat from '@backend/models/chat';

import { initMCP, mcpTools } from './index';
import { createOllamaCustomTransformer } from './ollama-custom-transformer';

interface StreamRequestBody {
  model: string;
  messages: Array<any>;
  sessionId?: string;
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

// Create Ollama provider with custom base URL
// The provider expects the base URL without /api suffix as it adds endpoints itself
const ollamaProvider = createOllama({
  baseURL: OLLAMA_HOST + '/api',
});

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
          model: ollamaProvider(model),
          messages: convertToModelMessages(messages),
          tools: Object.keys(tools).length > 0 ? tools : undefined,
          // Optional: Enable thinking mode for supported models
          providerOptions: {
            ollama: {
              think: false, // Can be enabled for models that support thinking
            },
          },
          onFinish: ({ messages: finalMessages }) => {
            // Save messages when streaming completes
            if (sessionId) {
              Chat.saveMessages(sessionId, finalMessages).catch((error) => {
                fastify.log.error('Failed to save messages:', error);
              });
            }
            fastify.log.info('Ollama response completed:', {
              model,
              sessionId,
              messagesCount: finalMessages.length,
            });
          },
        } as any);

        // Get the UI message stream response
        const response = result.toUIMessageStreamResponse({
          originalMessages: messages,
        });

        // Apply our custom transformer to fix Ollama-specific issues
        const filterTransform = createOllamaCustomTransformer();

        // Pipe the response through the filter
        const filteredResponse = new Response(response.body?.pipeThrough(filterTransform), {
          headers: {
            ...Object.fromEntries(response.headers.entries()),
            'Transfer-Encoding': 'chunked',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true',
          },
          status: response.status,
          statusText: response.statusText,
        });

        return reply.send(filteredResponse);
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
