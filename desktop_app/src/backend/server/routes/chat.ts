import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText } from 'ai';
import { FastifyPluginAsync } from 'fastify';
import { ollama } from 'ollama-ai-provider';

interface ChatRequestBody {
  messages: any[];
  provider?: 'openai' | 'ollama';
}

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ChatRequestBody }>('/api/chat', async (request, reply) => {
    const { messages, provider = 'openai' } = request.body;

    const model = provider === 'ollama' ? ollama('llama3.2') : openai('gpt-4o');

    console.log('Received message', messages);

    const result = streamText({
      model,
      messages: convertToModelMessages(messages),
    });

    // Convert Fastify's Reply to a Response-like object for compatibility with AI SDK
    const response = {
      headers: {
        set: (name: string, value: string) => reply.header(name, value),
      },
      write: (chunk: any) => reply.raw.write(chunk),
      end: () => reply.raw.end(),
    };

    // Set raw mode for streaming
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    result.toUIMessageStreamResponse(response as any);

    return reply;
  });
};

export default chatRoutes;
