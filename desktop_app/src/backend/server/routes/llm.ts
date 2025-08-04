import { createOpenAI, openai } from '@ai-sdk/openai';
import { convertToModelMessages, readUIMessageStream, streamText, createUIMessageStreamResponse } from 'ai';
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
    async (request: FastifyRequest<{ Body: StreamRequestBody }>, reply: FastifyReply) => {
      const { messages, sessionId } = request.body;

      let customOllama = createOllama({
        baseURL: OLLAMA_HOST + '/api',
      });

      let customOllama2 = createOpenAI({
        baseURL: OLLAMA_HOST + '/v1',
        apiKey: 'ollama',
      });

      console.log(messages);

      try {
        // Create the stream
        const result = streamText({
          // model: openai('gpt-4o'),
          model: customOllama('llama3.1:8b'),
          messages: convertToModelMessages(messages),
          // providerOptions: { ollama: { think: true } },
        });
        console.log('Streaming result:', result.toUIMessageStreamResponse());

        console.log('LLM STREAMING1', result);
        console.log('LLM STREAMING2', result.textStream);
        console.log('LLM STREAMING3', result.toUIMessageStreamResponse().body);

        for await (const textPart of result.textStream) {
          console.log(textPart);
        }

        console.log(
          'LLM STREAMING4',
          readUIMessageStream({
            stream: result.toUIMessageStream(),
          })
        );

        // console.log('LLM STREAMING4', result.toUIMessageStreamResponse());
        
        let textStream1 = result.textStream;
        return createUIMessageStreamResponse({ result });

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
