import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { openai } from '@ai-sdk/openai';
import { type UIMessage, convertToModelMessages, streamText } from 'ai';
import { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import { createOllama } from 'ollama-ai-provider';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

import { chatService } from '@backend/services/chat-service';
import { LLMStreamRequestSchema, LLMErrorResponseSchema } from '@/types/llm';

const llmRoutes: FastifyPluginAsync<FastifyPluginOptions, any, ZodTypeProvider> = async (fastify) => {
  fastify.post(
    '/api/llm/stream',
    {
      schema: {
        tags: ['llm'],
        summary: 'Stream LLM response',
        description: 'Stream a response from the specified LLM provider',
        body: LLMStreamRequestSchema,
        response: {
          200: {
            description: 'Streaming response',
            type: 'string',
            contentMediaType: 'text/event-stream'
          },
          500: LLMErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { messages, sessionId } = request.body;
      console.log(request.body);

      console.log('SESSION', sessionId);

      console.log('LLM stream request:', request.body);
      console.log(convertToModelMessages(messages));
      try {
        // Create the stream
        const result = streamText({
          model: openai('gpt-4o'),
          messages: convertToModelMessages(messages),
        });

        return reply.send(
          result.toUIMessageStreamResponse({
            originalMessages: messages,
            onFinish: ({ messages: finalMessages }) => {
              console.log('FINAL MESSAGES', finalMessages);
              console.log('Session', sessionId);
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
};

export default llmRoutes;
