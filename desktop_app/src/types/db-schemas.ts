import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { chatsTable } from '@backend/database/schema/chat';
import { messagesTable } from '@backend/database/schema/messages';

// Generate Zod schemas from Drizzle tables
export const insertChatSchema = createInsertSchema(chatsTable, {
  title: z.string().nullable().optional().describe('Chat title'),
  sessionId: z.string().optional().describe('Session ID (auto-generated if not provided)'),
});

export const selectChatSchema = createSelectSchema(chatsTable, {
  id: z.number().describe('Unique identifier for the chat'),
  sessionId: z.string().describe('Session ID for the chat'),
  title: z.string().nullable().describe('Chat title (auto-generated or user-defined)'),
  createdAt: z.string().describe('ISO 8601 timestamp of chat creation'),
  updatedAt: z.string().describe('ISO 8601 timestamp of last update'),
});

export const insertMessageSchema = createInsertSchema(messagesTable, {
  role: z.enum(['user', 'assistant', 'system']).describe('Message role'),
  content: z.string().describe('JSON stringified message content'),
});

export const selectMessageSchema = createSelectSchema(messagesTable, {
  id: z.number().describe('Unique message identifier'),
  chatId: z.number().describe('Reference to parent chat'),
  role: z.enum(['user', 'assistant', 'system']).describe('Message role'),
  content: z.string().describe('JSON stringified message content'),
  createdAt: z.string().describe('ISO 8601 timestamp of message creation'),
});

// API request/response schemas based on DB schemas
export const CreateChatRequestSchema = insertChatSchema
  .pick({ title: true })
  .extend({
    llm_provider: z.string().optional().describe('LLM provider to use (defaults to "ollama")'),
  })
  .describe('Create chat request');

export const UpdateChatRequestSchema = insertChatSchema
  .pick({ title: true })
  .describe('Update chat request');

// Chat with messages schema
export const ChatWithMessagesSchema = selectChatSchema
  .extend({
    llm_provider: z.string().describe('LLM provider used for this chat'),
    messages: z.array(z.any()).describe('Array of chat messages'), // We'll parse this separately
  })
  .describe('Chat with messages');

// Error response schema
export const ErrorResponseSchema = z.object({
  error: z.string().describe('Error message'),
}).describe('Error response');

// Path parameter schemas
export const ChatIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).describe('Chat ID'),
}).describe('Chat ID parameters');

// Export types
export type InsertChat = z.infer<typeof insertChatSchema>;
export type SelectChat = z.infer<typeof selectChatSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type SelectMessage = z.infer<typeof selectMessageSchema>;
export type CreateChatRequest = z.infer<typeof CreateChatRequestSchema>;
export type UpdateChatRequest = z.infer<typeof UpdateChatRequestSchema>;
export type ChatWithMessages = z.infer<typeof ChatWithMessagesSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ChatIdParams = z.infer<typeof ChatIdParamsSchema>;