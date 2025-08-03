import { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { chatService } from '@backend/services/chat-service';
import { 
  ChatWithMessagesSchema, 
  CreateChatRequestSchema, 
  UpdateChatRequestSchema, 
  ErrorResponseSchema,
  ChatIdParamsSchema
} from '@/types/db-schemas';

const chatRoutes: FastifyPluginAsync<FastifyPluginOptions, any, ZodTypeProvider> = async (fastify) => {
  // Get all chats
  fastify.get('/api/chat', {
    schema: {
      tags: ['chat'],
      summary: 'Get all chats',
      description: 'Retrieve all chat sessions with their messages',
      response: {
        200: z.array(ChatWithMessagesSchema),
        500: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      const chats = await chatService.getAllChats();
      return reply.code(200).send(chats);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get single chat with messages
  fastify.get('/api/chat/:id', {
    schema: {
      tags: ['chat'],
      summary: 'Get a single chat',
      description: 'Retrieve a specific chat session by ID with all its messages',
      params: ChatIdParamsSchema,
      response: {
        200: ChatWithMessagesSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
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
  });

  // Create new chat
  fastify.post('/api/chat', {
    schema: {
      tags: ['chat'],
      summary: 'Create a new chat',
      description: 'Create a new chat session',
      body: CreateChatRequestSchema,
      response: {
        201: ChatWithMessagesSchema,
        500: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      const chat = await chatService.createChat(request.body);
      return reply.code(201).send(chat);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Update chat
  fastify.patch('/api/chat/:id', {
    schema: {
      tags: ['chat'],
      summary: 'Update a chat',
      description: 'Update chat properties (e.g., title)',
      params: ChatIdParamsSchema,
      body: UpdateChatRequestSchema,
      response: {
        200: ChatWithMessagesSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
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
  fastify.delete('/api/chat/:id', {
    schema: {
      tags: ['chat'],
      summary: 'Delete a chat',
      description: 'Delete a chat session and all its messages',
      params: ChatIdParamsSchema,
      response: {
        204: z.null().describe('Chat deleted successfully'),
        400: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
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

};

export default chatRoutes;
