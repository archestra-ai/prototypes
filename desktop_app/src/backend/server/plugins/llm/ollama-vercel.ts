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

        const stream = createUIMessageStream<UIMessage>({
          execute: async ({ writer }) => {
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
            } as any);

            // Create a filtered stream that skips error messages
            const filteredStream = result.toUIMessageStream().pipeThrough(
              new TransformStream({
                transform(chunk, controller) {
                  console.log('Stream chunk:', chunk);
                  if (chunk.type !== 'error') {
                    controller.enqueue(chunk);
                    console.log('Passed through non-error chunk:', chunk);
                  } else {
                    console.log('Filtered out error chunk:', chunk);
                  }
                },
              })
            );

            writer.merge(filteredStream);
          },
        });

        // Return UI-compatible stream response
        return reply.send(
          createUIMessageStreamResponse({ stream })
          // result.toUIMessageStreamResponse({
          //   originalMessages: messages,
          //   onFinish: ({ messages: finalMessages, text, toolCalls, usage }) => {
          //     // Log final response details
          //     fastify.log.info('Ollama response completed:', {
          //       model,
          //       sessionId,
          //       text: text?.substring(0, 200) + (text && text.length > 200 ? '...' : ''),
          //       toolCallsCount: toolCalls?.length || 0,
          //       usage,
          //     });

          //     if (sessionId) {
          //       Chat.saveMessages(sessionId, finalMessages);
          //     }
          //   },
          // })
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
