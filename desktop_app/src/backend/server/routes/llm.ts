import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { openai } from '@ai-sdk/openai';
import { type UIMessage, convertToModelMessages, streamText } from 'ai';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createOllama } from 'ollama-ai-provider';

import { chatService } from '@backend/services/chat-service';

interface StreamRequestBody {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  messages: Array<any>;
  apiKey?: string;
  sessionId?: string;
}

export default async function llmRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: StreamRequestBody }>(
    '/api/llm/stream',
    async (request: FastifyRequest<{ Body: StreamRequestBody }>, reply: FastifyReply) => {
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
}
