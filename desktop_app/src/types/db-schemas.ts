import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { chatsTable } from '@backend/database/schema/chat';
import { messagesTable } from '@backend/database/schema/messages';

// Chat schemas
export const insertChatSchema = createInsertSchema(chatsTable);
export const selectChatSchema = createSelectSchema(chatsTable);

// Message schemas
export const insertMessageSchema = createInsertSchema(messagesTable);
export const selectMessageSchema = createSelectSchema(messagesTable);

// API request/response schemas
export const CreateChatRequestSchema = z.object({
  title: z.string().optional(),
  llm_provider: z.string().default('ollama'),
});

export const UpdateChatRequestSchema = z.object({
  title: z.string(),
});

export const ChatIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/),
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
});

// Simple message schema for API responses
export const MessageSchema = z.object({
  id: z.number(),
  chatId: z.number(),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  metadata: z.object({
    images: z.array(z.string()).optional(),
    thinking: z.string().optional(),
    toolCalls: z.array(z.any()).optional(),
  }).optional(),
  createdAt: z.string(),
});

// Chat with messages response
export const ChatWithMessagesSchema = z.object({
  id: z.number(),
  sessionId: z.string(),
  title: z.string().nullable(),
  llm_provider: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(MessageSchema),
});

// Types
export type InsertChat = z.infer<typeof insertChatSchema>;
export type SelectChat = z.infer<typeof selectChatSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type SelectMessage = z.infer<typeof selectMessageSchema>;
export type CreateChatRequest = z.infer<typeof CreateChatRequestSchema>;
export type UpdateChatRequest = z.infer<typeof UpdateChatRequestSchema>;
export type ChatWithMessages = z.infer<typeof ChatWithMessagesSchema>;
export type Message = z.infer<typeof MessageSchema>;