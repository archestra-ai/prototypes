import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { chatsTable } from '@backend/database/schema/chat';
import { messagesTable } from '@backend/database/schema/messages';
import type { CoreMessage } from 'ai';

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

// Message part schemas
const MessagePartSchema = z.object({
  type: z.enum(['text', 'image', 'tool-call', 'tool-result']),
  text: z.string().optional(),
  image: z.string().optional(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  input: z.any().optional(),
  output: z.any().optional(),
});

const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

// Generate schemas from Drizzle
export const insertMessageSchema = createInsertSchema(messagesTable);
export const selectMessageSchema = createSelectSchema(messagesTable);

// Helper to convert DB message to AI SDK format
export const toAISDKMessage = (dbMsg: z.infer<typeof selectMessageSchema>): CoreMessage & {
  images?: string[];
  thinking?: string;
} => {
  const base = {
    role: dbMsg.role,
    content: dbMsg.content,
    ...(dbMsg.images && { images: dbMsg.images }),
    ...(dbMsg.thinking && { thinking: dbMsg.thinking }),
  };

  // Add parts if they exist
  if (dbMsg.parts && dbMsg.parts.length > 0) {
    return { ...base, content: dbMsg.parts } as any;
  }

  // Add tool calls if they exist
  if (dbMsg.toolCalls && dbMsg.toolCalls.length > 0) {
    return { ...base, tool_calls: dbMsg.toolCalls } as any;
  }

  return base;
};

// Helper to convert AI SDK message to DB format
export const fromAISDKMessage = (msg: CoreMessage & { images?: string[]; thinking?: string }, chatId: number) => {
  const base = {
    chatId,
    role: msg.role,
    images: (msg as any).images,
    thinking: (msg as any).thinking,
  };

  // Handle string content
  if (typeof msg.content === 'string') {
    return { ...base, content: msg.content };
  }

  // Handle array content (parts)
  if (Array.isArray(msg.content)) {
    const textParts = msg.content.filter((p: any) => p.type === 'text');
    const textContent = textParts.map((p: any) => p.text).join('\n');
    
    return {
      ...base,
      content: textContent || 'No text content',
      parts: msg.content,
    };
  }

  // Handle tool calls
  if ((msg as any).tool_calls) {
    return {
      ...base,
      content: 'Tool calls',
      toolCalls: (msg as any).tool_calls,
    };
  }

  return { ...base, content: JSON.stringify(msg.content) };
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

// Extended message type with custom fields
export const AISDKMessageWithCustomFields = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(MessagePartSchema)]),
  tool_calls: z.array(ToolCallSchema).optional(),
  images: z.array(z.string()).optional(),
  thinking: z.string().optional(),
});

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