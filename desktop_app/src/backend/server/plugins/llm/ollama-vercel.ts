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

  // Add test endpoint for MCP status with Ollama
  fastify.get('/api/llm/ollama-vercel/mcp-status', async (request, reply) => {
    return reply.send({
      connected: mcpTools !== null,
      toolCount: mcpTools ? Object.keys(mcpTools).length : 0,
      tools: mcpTools
        ? Object.entries(mcpTools).map(([name, tool]) => ({
            name,
            description: (tool as any).description,
          }))
        : [],
      ollamaHost: OLLAMA_HOST,
    });
  });

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
          maxSteps: 5, // Allow multiple tool calls
          stopWhen: stepCountIs(5),
          // Optional: Enable thinking mode for supported models
          providerOptions: {
            ollama: {
              think: false, // Can be enabled for models that support thinking
            },
          },
          // onFinish: ({ messages: finalMessages }) => {
          //   // Save messages when streaming completes
          //   if (sessionId) {
          //     Chat.saveMessages(sessionId, finalMessages).catch((error) => {
          //       fastify.log.error('Failed to save messages:', error);
          //     });
          //   }
          //   fastify.log.info('Ollama response completed:', {
          //     model,
          //     sessionId,
          //     messagesCount: finalMessages.length,
          //   });
          // },
        } as any);

        return reply.send(result.toUIMessageStreamResponse());

        // Log each chunk from the full stream
        (async () => {
          try {
            for await (const chunk of result.fullStream) {
              // Log different chunk types with appropriate details
              if (chunk.type === 'text-delta') {
                fastify.log.info(`Stream chunk [${chunk.type}]:`, {
                  textDelta: chunk.textDelta,
                });
              } else if (chunk.type === 'tool-call') {
                fastify.log.info(`Stream chunk [${chunk.type}]:`, {
                  toolName: chunk.toolName,
                  args: chunk.args,
                });
              } else if (chunk.type === 'tool-result') {
                fastify.log.info(`Stream chunk [${chunk.type}]:`, {
                  toolName: chunk.toolName,
                  result: chunk.result,
                });
              } else {
                fastify.log.info(`Stream chunk [${chunk.type}]:`, chunk);
              }
            }
            fastify.log.info('Stream completed - all chunks processed');
          } catch (error) {
            fastify.log.error('Error logging stream chunks:', error);
          }
        })();

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
