import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { convertToModelMessages, stepCountIs, streamText } from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import Chat from '@backend/models/chat';
import CloudProviderModel from '@backend/models/cloudProvider';
import McpServerSandboxManager from '@backend/sandbox/manager';

import { handleOllamaStream } from './ollama-stream-handler';

interface StreamRequestBody {
  model: string;
  messages: Array<any>;
  sessionId?: string;
  provider?: string;
  requestedTools?: string[]; // Tool IDs requested by frontend
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string };
}

const llmRoutes: FastifyPluginAsync = async (fastify) => {
  // Note: MCP connections are now managed by McpServerSandboxManager
  // Based on this doc: https://ai-sdk.dev/docs/ai-sdk-core/generating-text
  fastify.post<{ Body: StreamRequestBody }>(
    '/api/llm/stream',
    {
      schema: {
        operationId: 'streamLlmResponse',
        description: 'Stream LLM response',
        tags: ['LLM'],
      },
    },
    async (request: FastifyRequest<{ Body: StreamRequestBody }>, reply: FastifyReply) => {
      const { messages, sessionId, model = 'gpt-4o', provider, requestedTools, toolChoice } = request.body;

      try {
        // Get tools from sandbox manager
        let tools = {};
        if (requestedTools && requestedTools.length > 0) {
          tools = McpServerSandboxManager.getToolsById(requestedTools);
        } else {
          tools = McpServerSandboxManager.getAllTools();
        }

        // Handle Ollama provider separately
        if (provider === 'ollama') {
          return handleOllamaStream(fastify, request, reply, tools);
        }
        // Check if it's a cloud provider model
        const providerConfig = await CloudProviderModel.getProviderConfigForModel(model);

        let modelInstance;
        if (providerConfig) {
          // Check provider type and use appropriate client
          if (providerConfig.provider.type === 'gemini') {
            // Use Google Generative AI client for Gemini
            const googleClient = createGoogleGenerativeAI({
              apiKey: providerConfig.apiKey,
              baseURL: providerConfig.provider.baseUrl,
            });
            modelInstance = googleClient(model);
          } else if (providerConfig.provider.type === 'anthropic') {
            // Use Anthropic client for Claude
            const anthropicClient = createAnthropic({
              apiKey: providerConfig.apiKey,
              baseURL: providerConfig.provider.baseUrl,
            });
            modelInstance = anthropicClient(model);
          } else if (providerConfig.provider.type === 'deepseek') {
            const deepseekClient = createDeepSeek({
              apiKey: providerConfig.apiKey,
              baseURL: providerConfig.provider.baseUrl || 'https://api.deepseek.com/v1',
              // headers: providerConfig.provider.headers,
            });
            modelInstance = deepseekClient(model);
          } else {
            // Use OpenAI-compatible client for other providers
            const openaiClient = createOpenAI({
              apiKey: providerConfig.apiKey,
              baseURL: providerConfig.provider.baseUrl,
              headers: providerConfig.provider.headers,
            });
            modelInstance = openaiClient(model);
          }
        } else {
          // Default OpenAI client (for backward compatibility)
          modelInstance = openai(model);
        }

        // Create the stream with the appropriate model
        const hasTools = Object.keys(tools).length > 0;
        const streamConfig: any = {
          model: modelInstance,
          messages: convertToModelMessages(messages),
          maxSteps: 5, // Allow multiple tool calls
          stopWhen: stepCountIs(5),
          // experimental_transform: smoothStream({
          //   delayInMs: 20, // optional: defaults to 10ms
          //   chunking: 'line', // optional: defaults to 'word'
          // }),
          // onError({ error }) {
          // },
        };

        // Only add tools and toolChoice if tools are available
        if (hasTools) {
          streamConfig.tools = tools;
          streamConfig.toolChoice = toolChoice || 'auto';
        }

        const result = streamText(streamConfig);

        return reply.send(
          result.toUIMessageStreamResponse({
            originalMessages: messages,
            onFinish: ({ messages: finalMessages }) => {
              if (sessionId) {
                Chat.saveMessages(sessionId, finalMessages);
              }
            },
          })
        );
      } catch (error) {
        fastify.log.error('LLM streaming error:', error);
        return reply.code(500).send({
          error: 'Failed to stream response',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
};

export default llmRoutes;
