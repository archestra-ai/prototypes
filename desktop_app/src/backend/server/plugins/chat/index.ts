import { FastifyPluginAsync } from 'fastify';

import { CreateChatRequest, UpdateChatRequest, chatService } from '@backend/models/chat';

interface ChatParams {
  id: string;
}

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all chats
  fastify.get(
    '/api/chat',
    {
      schema: {
        operationId: 'getChats',
        description: 'Get all chats',
        tags: ['Chat'],
      },
    },
    async (request, reply) => {
      try {
        const chats = await chatService.getAllChats();
        return reply.code(200).send(chats);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get single chat with messages
  fastify.get<{ Params: ChatParams }>(
    '/api/chat/:id',
    {
      schema: {
        operationId: 'getChatById',
        description: 'Get single chat with messages',
        tags: ['Chat'],
      },
    },
    async (request, reply) => {
      try {
        const chatId = parseInt(request.params.id, 10);
        if (isNaN(chatId)) {
          return reply.code(400).send({ error: 'Invalid chat ID' });
        }

        const chat = await chatService.getChatById(chatId);
        if (!chat) {
          return reply.code(404).send({ error: 'Chat not found' });
        }

        return reply.code(200).send(chat);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Create new chat
  fastify.post<{ Body: CreateChatRequest }>(
    '/api/chat',
    {
      schema: {
        operationId: 'createChat',
        description: 'Create new chat',
        tags: ['Chat'],
      },
    },
    async (request, reply) => {
      try {
        const chat = await chatService.createChat(request.body);
        return reply.code(201).send(chat);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update chat
  fastify.patch<{ Params: ChatParams; Body: UpdateChatRequest }>(
    '/api/chat/:id',
    {
      schema: {
        operationId: 'updateChat',
        description: 'Update chat',
        tags: ['Chat'],
      },
    },
    async (request, reply) => {
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
    }
  );

  // Delete chat
  fastify.delete<{ Params: ChatParams }>(
    '/api/chat/:id',
    {
      schema: {
        operationId: 'deleteChat',
        description: 'Delete chat',
        tags: ['Chat'],
      },
    },
    async (request, reply) => {
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
    }
  );
};

export default chatRoutes;
