import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createOllama } from 'ollama-ai-provider';

interface StreamRequestBody {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  apiKey?: string;
  sessionId?: string;
}

const AI_PROVIDERS = {
  openai: {
    createProvider: (apiKey: string) =>
      createOpenAI({
        apiKey,
        baseURL: 'https://api.openai.com/v1',
      }),
  },
  anthropic: {
    createProvider: (apiKey: string) =>
      createAnthropic({
        apiKey,
      }),
    streamOptions: {
      headers: {
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    },
  },
  ollama: {
    createProvider: () =>
      createOllama({
        baseURL: 'http://localhost:11434',
      }),
  },
};

export default async function llmRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: StreamRequestBody }>(
    '/api/llm/stream',
    {
      schema: {
        body: {
          type: 'object',
          required: ['provider', 'model', 'messages'],
          properties: {
            provider: { type: 'string', enum: ['openai', 'anthropic', 'ollama'] },
            model: { type: 'string' },
            messages: {
              type: 'array',
              items: {
                type: 'object',
                required: ['role', 'content'],
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                  content: { type: 'string' },
                },
              },
            },
            apiKey: { type: 'string' },
            sessionId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: StreamRequestBody }>, reply: FastifyReply) => {
      const { provider, model, messages, apiKey, sessionId } = request.body;

      try {
        // Validate API key for non-ollama providers
        if (provider !== 'ollama' && !apiKey) {
          return reply.code(400).send({
            error: `${provider} API key is required`,
          });
        }

        // Create provider instance
        const providerConfig = AI_PROVIDERS[provider];
        const aiProvider = providerConfig.createProvider(apiKey || '');

        // Prepare stream options
        const streamOptions: any = {
          model: aiProvider(model),
          messages,
        };

        // Add provider-specific options
        if (providerConfig.streamOptions) {
          Object.assign(streamOptions, providerConfig.streamOptions);
        }

        // Create the stream
        const result = streamText(streamOptions);

        // Set headers for Vercel AI SDK data stream
        reply.header('X-Vercel-AI-Data-Stream', 'v1');
        reply.header('Content-Type', 'text/plain; charset=utf-8');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Connection', 'keep-alive');

        // Convert to data stream and send
        const dataStream = result.toDataStream();

        // Pipe the stream to the response
        return reply.send(dataStream);
      } catch (error) {
        fastify.log.error('LLM streaming error:', error);
        return reply.code(500).send({
          error: 'Failed to stream response',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
