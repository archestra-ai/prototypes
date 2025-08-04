import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText } from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { chatService } from '@backend/models/chat';

interface StreamRequestBody {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  messages: Array<any>;
  apiKey?: string;
  sessionId?: string;
}

const llmRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: StreamRequestBody }>(
    '/api/llm/stream',
    async (request: FastifyRequest<{ Body: StreamRequestBody }>, reply: FastifyReply) => {
      const { messages, sessionId } = request.body;
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
