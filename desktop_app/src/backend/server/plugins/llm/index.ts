import { createOpenAI, openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  readUIMessageStream,
  streamText,
} from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createOllama } from 'ollama-ai-provider-v2';

import { chatService } from '@backend/models/chat';

interface StreamRequestBody {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  messages: Array<any>;
  apiKey?: string;
  sessionId?: string;
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

const llmRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: StreamRequestBody }>(
    '/api/llm/stream',
    {
      schema: {
        operationId: 'streamLlmResponse',
        description: 'Stream LLM response',
        tags: ['LLM'],
      },
    },
    async (request: FastifyRequest<{ Body: StreamRequestBody }>, reply: FastifyReply) => {
      const { messages, sessionId } = request.body;

      let customOllama = createOllama({
        baseURL: OLLAMA_HOST + '/api',
      });

      try {
        // Create the stream
        const result = streamText({
          // model: openai('gpt-4o'),
          model: customOllama('llama3.1:8b'),
          messages: convertToModelMessages(messages),
          // providerOptions: { ollama: { think: true } },
        });

        // There is a bug with toUIMessageStreamResponse and ollama provider
        // it cannot parse the response and it throws an error
        // TypeError: Cannot read properties of undefined (reading 'text')
        // so we send sse stream manually, otherwise we could use:
        // return reply.send(
        //   result.toUIMessageStreamResponse({
        //     originalMessages: messages,
        //     onFinish: ({ messages: finalMessages }) => {
        //       console.log('FINAL MESSAGES', finalMessages);
        //       console.log('Session', sessionId);
        //       if (sessionId) {
        //         chatService.saveMessages(sessionId, finalMessages);
        //       }
        //     },
        //   })
        // );
        let messageId = generateId();
        let fullText = '';

        reply.raw.write(`data: {"type":"start"} \n\n`);
        reply.raw.write(`data: {"type":"start-step"}\n\n`);
        reply.raw.write(`data: ${JSON.stringify({ type: 'text-start', id: messageId })}\n\n`);

        for await (const chunk of result.textStream) {
          fullText += chunk;
          reply.raw.write(`data: ${JSON.stringify({ type: 'text-delta', id: messageId, delta: chunk })}\n\n`);
        }

        reply.raw.write(`data: ${JSON.stringify({ type: 'end', id: messageId })}\n\n`);
        reply.raw.write(`data: [DONE]\n\n`);
        reply.raw.end();

        // Save messages after streaming completes
        if (sessionId) {
          const assistantMessage = {
            id: messageId,
            role: 'assistant',
            content: fullText,
            parts: [
              {
                type: 'text',
                text: fullText,
              },
            ],
          };
          const finalMessages = [...messages, assistantMessage];
          await chatService.saveMessages(sessionId, finalMessages);
        }
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
