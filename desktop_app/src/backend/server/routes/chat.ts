import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText } from 'ai';
import { FastifyPluginAsync } from 'fastify';
import { ollama } from 'ollama-ai-provider';
import { chatService, CreateChatRequest, UpdateChatRequest } from '@/server/services/chat';

interface ChatRequestBody {
  messages: any[];
  provider?: 'openai' | 'ollama';
}

interface ChatParams {
  id: string;
}

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all chats
  fastify.get('/api/chat', async (request, reply) => {
    try {
      const chats = await chatService.getAllChats();
      return reply.code(200).send(chats);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Create new chat
  fastify.post<{ Body: CreateChatRequest }>('/api/chat', async (request, reply) => {
    try {
      const chat = await chatService.createChat(request.body);
      return reply.code(201).send(chat);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Update chat
  fastify.patch<{ Params: ChatParams; Body: UpdateChatRequest }>('/api/chat/:id', async (request, reply) => {
    try {
      const chatId = parseInt(request.params.id, 10);
      if (isNaN(chatId)) {
        return reply.code(400).send({ error: 'Invalid chat ID' });
      }

      const chat = await chatService.updateChat(chatId, request.body);
      if (!chat) {
        return reply.code(404).send({ error: 'Chat not found' });
      }

      return reply.code(200).send(chat);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Delete chat
  fastify.delete<{ Params: ChatParams }>('/api/chat/:id', async (request, reply) => {
    try {
      const chatId = parseInt(request.params.id, 10);
      if (isNaN(chatId)) {
        return reply.code(400).send({ error: 'Invalid chat ID' });
      }

      await chatService.deleteChat(chatId);
      return reply.code(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Chat streaming endpoint (existing functionality)
  fastify.post<{ Body: ChatRequestBody }>('/api/chat/stream', async (request, reply) => {
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
