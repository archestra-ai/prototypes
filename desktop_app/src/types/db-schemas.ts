import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { chatsTable } from '@backend/database/schema/chat';
import { messagesTable } from '@backend/database/schema/messages';
import type { CoreMessage, CoreAssistantMessage, CoreSystemMessage, CoreUserMessage, CoreToolMessage } from 'ai';
import { coreMessageSchema, coreAssistantMessageSchema, coreUserMessageSchema, coreSystemMessageSchema, coreToolMessageSchema } from 'ai';

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

// Generate schemas from Drizzle
export const insertMessageSchema = createInsertSchema(messagesTable);

export const selectMessageSchema = createSelectSchema(messagesTable);

// Helper to convert DB message to AI SDK format
export const toAISDKMessage = (dbMsg: z.infer<typeof selectMessageSchema>): CoreMessage => {
  const base: any = {
    role: dbMsg.role,
    content: dbMsg.content,
  };

  // Add custom fields
  if (dbMsg.images && dbMsg.images.length > 0) {
    base.images = dbMsg.images;
  }
  if (dbMsg.thinking) {
    base.thinking = dbMsg.thinking;
  }

  // Add parts if they exist (for multi-part content)
  if (dbMsg.parts && dbMsg.parts.length > 0) {
    base.content = dbMsg.parts;
  }

  // Add tool calls if they exist (for assistant messages)
  if (dbMsg.toolCalls && dbMsg.toolCalls.length > 0 && dbMsg.role === 'assistant') {
    base.toolCalls = dbMsg.toolCalls;
  }

  return base as CoreMessage;
};

// Helper to convert AI SDK message to DB format
export const fromAISDKMessage = (msg: CoreMessage & { images?: string[]; thinking?: string }, chatId: number) => {
  const base: any = {
    chatId,
    role: msg.role,
  };

  // Add custom fields if present
  if ('images' in msg && msg.images) {
    base.images = msg.images;
  }
  if ('thinking' in msg && msg.thinking) {
    base.thinking = msg.thinking;
  }

  // Handle content based on type
  if (typeof msg.content === 'string') {
    base.content = msg.content;
  } else if (Array.isArray(msg.content)) {
    // Multi-part content
    const textParts = msg.content.filter((p: any) => p.type === 'text');
    const textContent = textParts.map((p: any) => p.text).join('\n');
    
    base.content = textContent || 'No text content';
    base.parts = msg.content;
  } else {
    base.content = JSON.stringify(msg.content);
  }

  // Handle tool calls for assistant messages
  if (msg.role === 'assistant' && 'toolCalls' in msg && (msg as CoreAssistantMessage).toolCalls) {
    base.toolCalls = (msg as CoreAssistantMessage).toolCalls;
    if (!base.content) {
      base.content = 'Tool calls';
    }
  }

  return base;
};

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

// Extended message type with custom fields - extend AI SDK's schema
export const AISDKMessageWithCustomFields = coreMessageSchema.and(
  z.object({
    images: z.array(z.string()).optional(),
    thinking: z.string().optional(),
  })
);

// Chat with messages schema
export const ChatWithMessagesSchema = selectChatSchema
  .extend({
    llm_provider: z.string().describe('LLM provider used for this chat'),
    messages: z.array(AISDKMessageWithCustomFields).describe('Array of AI SDK messages with custom fields'),
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