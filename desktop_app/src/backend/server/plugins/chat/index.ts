import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import ChatModel, { SelectChatSchema } from '@backend/models/chat';
import { ErrorResponseSchema, StringNumberIdSchema } from '@backend/schemas';

// TODO: is there any where to get SelectChatSchema to "naturally" include "messages"
const ChatResponseSchema = SelectChatSchema.extend({
  messages: z.array(z.any()), // Messages are added by the service
});

const chatRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/chat',
    {
      schema: {
        operationId: 'getChats',
        description: 'Get all chats',
        tags: ['Chat'],
        response: {
          200: z.array(ChatResponseSchema),
        },
      },
    },
    async (_request, reply) => {
      const chats = await ChatModel.getAllChats();
      return reply.code(200).send(chats);
    }
  );

  fastify.get(
    '/api/chat/:id',
    {
      schema: {
        operationId: 'getChatById',
        description: 'Get single chat with messages',
        tags: ['Chat'],
        params: z.object({
          id: StringNumberIdSchema,
        }),
        response: {
          200: ChatResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async ({ params: { id } }, reply) => {
      const chat = await ChatModel.getChatById(id);
      if (!chat) {
        return reply.code(404).send({ error: 'Chat not found' });
      }

      return reply.code(200).send(chat);
    }
  );

  fastify.post(
    '/api/chat',
    {
      schema: {
        operationId: 'createChat',
        description: 'Create new chat',
        tags: ['Chat'],
        body: z.object({
          // Currently empty - chat creation doesn't require any fields
        }),
        response: {
          201: ChatResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const chat = await ChatModel.createChat();
      return reply.code(201).send(chat);
    }
  );

  fastify.patch(
    '/api/chat/:id',
    {
      schema: {
        operationId: 'updateChat',
        description: 'Update chat',
        tags: ['Chat'],
        params: z.object({
          id: StringNumberIdSchema,
        }),
        body: z.object({
          title: z.string().nullable().optional(),
        }),
        response: {
          200: ChatResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async ({ params: { id }, body }, reply) => {
      const chat = await ChatModel.updateChat(id, body);
      if (!chat) {
        return reply.code(404).send({ error: 'Chat not found' });
      }

      return reply.code(200).send(chat);
    }
  );

  fastify.delete(
    '/api/chat/:id',
    {
      schema: {
        operationId: 'deleteChat',
        description: 'Delete chat',
        tags: ['Chat'],
        params: z.object({
          id: StringNumberIdSchema,
        }),
        response: {
          204: z.null(),
          404: ErrorResponseSchema,
        },
      },
    },
    async ({ params: { id } }, reply) => {
      await ChatModel.deleteChat(id);
      return reply.code(204).send();
    }
  );
};

export default chatRoutes;
