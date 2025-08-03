import { z } from 'zod';

// LLM streaming request schema
export const LLMStreamRequestSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'ollama']).describe('LLM provider to use'),
  model: z.string().describe('Model identifier'),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).describe('Conversation messages'),
  apiKey: z.string().optional().describe('API key for the provider (optional)'),
  sessionId: z.string().optional().describe('Session ID for message persistence'),
}).describe('LLM streaming request');

// Error response schema
export const LLMErrorResponseSchema = z.object({
  error: z.string().describe('Error message'),
  details: z.string().optional().describe('Additional error details'),
}).describe('LLM error response');

// Export types
export type LLMStreamRequest = z.infer<typeof LLMStreamRequestSchema>;
export type LLMErrorResponse = z.infer<typeof LLMErrorResponseSchema>;