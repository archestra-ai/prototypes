import { createOpenAI, openai } from '@ai-sdk/openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  CoreTool,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  readUIMessageStream,
  streamText,
} from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createOllama } from 'ollama-ai-provider-v2';
import { z } from 'zod';

import { chatService } from '@backend/models/chat';

interface StreamRequestBody {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  messages: Array<any>;
  apiKey?: string;
  sessionId?: string;
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';

// Simple MCP client
let mcpClient: Client | null = null;
let mcpTools: any[] = [];

// Initialize MCP connection
async function initMCP() {
  console.log(`Initializing MCP server connection to ${MCP_SERVER_URL}...`);
  try {
    mcpClient = new Client({ name: 'llm-plugin', version: '1.0.0' }, { capabilities: { tools: {} } });

    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL + '/mcp'));
    console.log('Connecting to MCP server...');
    await mcpClient.connect(transport);
    console.log('Connected to MCP server successfully');

    // Get available tools
    const { tools } = await mcpClient.listTools();
    mcpTools = tools;
    console.log(`Found ${tools.length} tools:`, tools.map((t) => t.name).join(', '));

    return true;
  } catch (error: any) {
    console.error('Failed to connect to MCP server:', error.message || error);
    console.log('MCP features will be disabled. To enable:');
    console.log('1. Ensure MCP server is running on', MCP_SERVER_URL);
    console.log('2. Or set MCP_SERVER_URL environment variable');
    mcpClient = null;
    mcpTools = [];
    return false;
  }
}

const llmRoutes: FastifyPluginAsync = async (fastify) => {
  // Initialize MCP on startup
  const mcpConnected = await initMCP();

  // Log available tools
  if (mcpTools.length > 0) {
    fastify.log.info('Available MCP tools:');
    mcpTools.forEach((tool) => {
      fastify.log.info(`  - ${tool.name}: ${tool.description || 'No description'}`);
    });
  }

  // Add test endpoint for MCP status
  fastify.get('/api/mcp/test', async (request, reply) => {
    return reply.send({
      connected: mcpConnected,
      serverUrl: MCP_SERVER_URL,
      toolCount: mcpTools.length,
      tools: mcpTools.map((t) => ({ name: t.name, description: t.description })),
    });
  });
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
      const { messages, sessionId, provider = 'ollama' } = request.body;

      let customOllama = createOllama({
        baseURL: OLLAMA_HOST + '/api',
      });

      try {
        // Convert MCP tools to AI SDK format if enabled
        let tools: Record<string, CoreTool> = {};

        // Always use MCP tools if available
        if (!mcpClient || mcpTools.length === 0) {
          fastify.log.info('MCP tools not available - running without tools');
        } else {
          fastify.log.info(`MCP enabled - converting ${mcpTools.length} tools for LLM`);

          for (const tool of mcpTools) {
            tools[tool.name] = {
              description: tool.description || '',
              parameters: z.any(), // Simple schema for POC
              execute: async (args: any) => {
                fastify.log.info(`\n🔧 TOOL CALL: ${tool.name}`);
                fastify.log.info(`   Arguments: ${JSON.stringify(args, null, 2)}`);

                try {
                  const startTime = Date.now();
                  const result = await mcpClient!.callTool({ name: tool.name, arguments: args });
                  const duration = Date.now() - startTime;

                  fastify.log.info(`   ✅ Success (${duration}ms)`);
                  fastify.log.info(`   Result: ${JSON.stringify(result, null, 2)}\n`);

                  return result;
                } catch (error) {
                  fastify.log.error(`   ❌ Error: ${error}`);
                  throw error;
                }
              },
            };
          }

          fastify.log.info(`Tools registered: ${Object.keys(tools).join(', ')}`);
        }

        // Create the stream
        const streamConfig = {
          // model: openai('gpt-4o'),
          model: customOllama('llama3.1:8b'),
          messages: convertToModelMessages(messages),
          // tools: Object.keys(tools).length > 0 ? tools : undefined,
          // maxSteps: 5, // Allow multiple tool calls
          // providerOptions: { ollama: { think: true } },
        };

        fastify.log.info(`Starting LLM stream with ${Object.keys(tools).length} tools`);

        const result = streamText(streamConfig);

        // // Debugging respons123e
        for await (const chunk of result.fullStream) {
          console.log('chunk', chunk);
        }
        return reply.send(result.fullStream);

        // If NOT using Ollama, use the proper UI stream response
        if (provider !== 'ollama') {
          fastify.log.info('Using UI stream response for tool-enabled chat (non-Ollama provider)');

          return reply.send(
            result.toUIMessageStreamResponse({
              originalMessages: messages,
              onFinish: ({ messages: finalMessages }) => {
                fastify.log.info(`\n📝 Chat finished with ${finalMessages.length} messages`);

                // Log tool invocations in final messages
                finalMessages.forEach((msg: any) => {
                  if (msg.toolInvocations && msg.toolInvocations.length > 0) {
                    fastify.log.info(`Message ${msg.id} had ${msg.toolInvocations.length} tool invocations`);
                  }
                });

                if (sessionId) {
                  chatService.saveMessages(sessionId, finalMessages);
                }
              },
            })
          );
        }

        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');

        const messageId = generateId();
        let textContent = '';
        let toolInvocations: any[] = [];
        let currentToolCallId: string | null = null;

        reply.raw.write(`data: {"type":"start"}\n\n`);

        try {
          // Process the full stream to handle both text and tool calls
          fastify.log.info('Starting to process fullStream...');
          let chunkCount = 0;

          for await (const chunk of result.fullStream) {
            chunkCount++;
            fastify.log.info(`Processing chunk ${chunkCount}: ${chunk.type}`, { chunk });
            if (chunk.type === 'text-delta') {
              if (!textContent) {
                reply.raw.write(`data: ${JSON.stringify({ type: 'text-start', id: messageId })}\n\n`);
              }
              textContent += chunk.textDelta;
              reply.raw.write(
                `data: ${JSON.stringify({ type: 'text-delta', id: messageId, delta: chunk.textDelta })}\n\n`
              );
            } else if (chunk.type === 'tool-call') {
              currentToolCallId = chunk.toolCallId;
              reply.raw.write(
                `data: ${JSON.stringify({
                  type: 'tool-call-start',
                  id: messageId,
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  args: chunk.args,
                })}\n\n`
              );
            } else if (chunk.type === 'tool-result' && currentToolCallId) {
              toolInvocations.push({
                toolCallId: currentToolCallId,
                toolName: chunk.toolName,
                args: chunk.args,
                result: chunk.result,
              });
              reply.raw.write(
                `data: ${JSON.stringify({
                  type: 'tool-result',
                  id: messageId,
                  toolCallId: currentToolCallId,
                  result: chunk.result,
                })}\n\n`
              );
              currentToolCallId = null;
            }
          }

          fastify.log.info(`Processed ${chunkCount} chunks from fullStream`);

          reply.raw.write(`data: ${JSON.stringify({ type: 'finish', id: messageId })}\n\n`);
          reply.raw.write(`data: [DONE]\n\n`);
          reply.raw.end();
        } catch (streamError) {
          fastify.log.error('Error processing stream:', streamError);
          reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: String(streamError) })}\n\n`);
          reply.raw.end();
          throw streamError;
        }

        // Get the final message for saving
        const finalMessage = await result.message;

        // Save messages after streaming completes
        if (sessionId) {
          const assistantMessage = {
            id: messageId,
            role: 'assistant',
            content: finalMessage.content,
            toolInvocations: finalMessage.toolInvocations,
          };
          const finalMessages = [...messages, assistantMessage];
          await chatService.saveMessages(sessionId, finalMessages);
        }
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
