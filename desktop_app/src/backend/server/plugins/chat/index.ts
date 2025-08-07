import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import ChatModel, { selectChatSchema } from '@backend/models/chat';

// Request schemas
const createChatRequestSchema = z.object({
  // Currently empty - chat creation doesn't require any fields
});

const updateChatRequestSchema = z.object({
  title: z.string().nullable().optional(),
});

// Request params schemas
const chatParamsSchema = z.object({
  id: z.string(),
});

// Response schemas
const chatResponseSchema = selectChatSchema.extend({
  messages: z.array(z.any()), // Messages are added by the service
});

const chatsListResponseSchema = z.array(chatResponseSchema);

// Type exports
type CreateChatRequest = z.infer<typeof createChatRequestSchema>;
type UpdateChatRequest = z.infer<typeof updateChatRequestSchema>;
type ChatParams = z.infer<typeof chatParamsSchema>;

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all chats
  fastify.get(
    '/api/chat',
    {
      schema: {
        operationId: 'getChats',
        description: 'Get all chats',
        tags: ['Chat'],
        response: {
          200: chatsListResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const chats = await ChatModel.getAllChats();
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
        response: {
          200: chatResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const chatId = parseInt(request.params.id, 10);
        if (isNaN(chatId)) {
          return reply.code(400).send({ error: 'Invalid chat ID' });
        }

        const chat = await ChatModel.getChatById(chatId);
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
        body: createChatRequestSchema,
        response: {
          201: chatResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const chat = await ChatModel.createChat();
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
        body: updateChatRequestSchema,
        response: {
          200: chatResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const chatId = parseInt(request.params.id, 10);
        if (isNaN(chatId)) {
          return reply.code(400).send({ error: 'Invalid chat ID' });
        }

        const chat = await ChatModel.updateChat(chatId, request.body);
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

        await ChatModel.deleteChat(chatId);
        return reply.code(204).send();
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default chatRoutes;
