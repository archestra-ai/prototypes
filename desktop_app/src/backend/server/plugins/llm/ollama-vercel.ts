import {
  UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  readUIMessageStream,
  stepCountIs,
  streamText,
} from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createOllama } from 'ollama-ai-provider-v2';

import Chat from '@backend/models/chat';

import { initMCP, mcpTools } from './index';

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
          onChunk: ({ chunk }) => {
            console.log('onChunk received:', chunk);
          },
          onError: (error) => {
            console.log('onError received:', error);
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

        // Hijack the response to handle SSE manually
        reply.hijack();

        // Set SSE headers
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no');
        reply.raw.writeHead(200);

        // Process the UI message stream
        (async () => {
          try {
            for await (const chunk of result.toUIMessageStream()) {
              console.log('Processing chunk:', chunk);

              // Skip error chunks
              if (chunk && chunk.type === 'error') {
                console.log('Skipping error chunk:', chunk);
                continue;
              }

              // Send all other chunks
              if (chunk) {
                const data = JSON.stringify(chunk);
                reply.raw.write(`data: ${data}\n\n`);
              }
            }

            // Stream completed
            reply.raw.end();
            console.log('Stream completed successfully');
          } catch (error) {
            fastify.log.error('Stream processing error:', error);
            reply.raw.end();
          }
        })();

        return;
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
