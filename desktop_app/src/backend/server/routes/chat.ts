import { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { chatService } from '@backend/services/chat-service';
import { 
  ChatWithMessagesSchema, 
  CreateChatRequestSchema, 
  UpdateChatRequestSchema, 
  ErrorResponseSchema,
  ChatIdParamsSchema
} from '@/types/db-schemas';

const chatRoutes: FastifyPluginAsync<FastifyPluginOptions, any, ZodTypeProvider> = async (fastify) => {
  // Simple test endpoint
  fastify.get('/api/chat/test', async (request, reply) => {
    return { message: 'Chat routes are working!' };
  });
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

  // Get single chat with messages
  fastify.get<{ Params: { id: string } }>('/api/chat/:id', async (request, reply) => {
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
  fastify.post('/api/chat', async (request, reply) => {
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
