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
          execute: ({ writer }) => {
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
              // onChunk: ({ chunk }) => {
              //   console.log('onChunk received:', chunk);
              // },
              // onError: (error) => {
              //   console.log('onError received:', error);
              // },
            } as any);

            (async () => {
              for await (const uiMessage of result.toUIMessageStream()) {
                console.log('HIHIHI');
                uiMessage.parts.forEach((part) => {
                  console.log('OKOKOK');
                  console.log(part);
                });
              }
            })();

            console.log('LOLOOL');
            console.log(result.toUIMessageStream());

            // Log the raw stream chunks
            (async () => {
              try {
                // Try logging from fullStream with JSON.stringify
                for await (const chunk of result.fullStream) {
                  console.log('Chunk:', chunk);
                }
                fastify.log.info('Stream completed');
              } catch (error) {
                fastify.log.error('Stream logging error:', error);
              }
            })();

            // writer.merge(result.toUIMessageStream());
          },
        });

        // // Also try to log the final result
        // result.text
        //   .then((text) => {
        //     fastify.log.info(`Final Ollama response: "${text}"`);
        //   })
        //   .catch((err) => {
        //     fastify.log.error('Error getting final text:', err);
        //   });
        //
        return reply.send('hi');

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
