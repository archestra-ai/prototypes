import { z } from 'zod';

// Base schemas
export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']).describe('Role of the message sender'),
  content: z.string().describe('Message content'),
  images: z.array(z.string()).optional(),
  thinking: z.string().optional(),
  tool_calls: z.array(z.any()).optional(),
}).describe('Chat message');

export const ChatSchema = z.object({
  id: z.number().describe('Unique identifier for the chat'),
  session_id: z.string().describe('Session ID for the chat'),
  title: z.string().nullable().describe('Chat title (auto-generated or user-defined)'),
  created_at: z.string().describe('ISO 8601 timestamp of chat creation'),
  updated_at: z.string().describe('ISO 8601 timestamp of last update'),
  llm_provider: z.string().describe('LLM provider used for this chat'),
  messages: z.array(ChatMessageSchema).describe('Array of chat messages'),
}).describe('Chat with messages');

// Request schemas
export const CreateChatRequestSchema = z.object({
  llm_provider: z.string().optional().describe('LLM provider to use (defaults to "ollama")'),
}).describe('Create chat request');

export const UpdateChatRequestSchema = z.object({
  title: z.string().nullable().optional().describe('New title for the chat'),
}).describe('Update chat request');

// Response schemas
export const ErrorResponseSchema = z.object({
  error: z.string().describe('Error message'),
}).describe('Error response');

// Path parameter schemas
export const ChatIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).describe('Chat ID'),
}).describe('Chat ID parameters');

// Export types
export type Chat = z.infer<typeof ChatSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type CreateChatRequest = z.infer<typeof CreateChatRequestSchema>;
export type UpdateChatRequest = z.infer<typeof UpdateChatRequestSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ChatIdParams = z.infer<typeof ChatIdParamsSchema>;