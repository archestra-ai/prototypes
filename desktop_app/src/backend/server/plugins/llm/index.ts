import { createOpenAI, openai } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  CoreTool,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  experimental_createMCPClient,
  generateId,
  readUIMessageStream,
  smoothStream,
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

// MCP client using Vercel AI SDK
let mcpClient: any = null;
let mcpTools: any = null;

// Initialize MCP connection using Vercel AI SDK
async function initMCP() {
  console.log(`Initializing MCP server connection to ${MCP_SERVER_URL}...`);
  try {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL + '/mcp'));

    console.log('Creating MCP client...');
    mcpClient = await experimental_createMCPClient({
      transport,
    });

    console.log('Connected to MCP server successfully');

    // Get available tools from MCP server
    mcpTools = await mcpClient.tools();
    console.log(`Found ${Object.keys(mcpTools).length} tools:`, Object.keys(mcpTools).join(', '));

    return true;
  } catch (error: any) {
    console.error('Failed to connect to MCP server:', error.message || error);
    console.log('MCP features will be disabled. To enable:');
    console.log('1. Ensure MCP server is running on', MCP_SERVER_URL);
    console.log('2. Or set MCP_SERVER_URL environment variable');
    mcpClient = null;
    mcpTools = null;
    return false;
  }
}

const llmRoutes: FastifyPluginAsync = async (fastify) => {
  // Initialize MCP on startup
  const mcpConnected = await initMCP();

  // Log available tools
  if (mcpTools && Object.keys(mcpTools).length > 0) {
    fastify.log.info('Available MCP tools:');
    Object.entries(mcpTools).forEach(([name, tool]) => {
      fastify.log.info(`  - ${name}: ${(tool as any).description || 'No description'}`);
    });
  }

  // Add test endpoint for MCP status
  fastify.get('/api/mcp/test', async (request, reply) => {
    return reply.send({
      connected: mcpConnected,
      serverUrl: MCP_SERVER_URL,
      toolCount: mcpTools ? Object.keys(mcpTools).length : 0,
      tools: mcpTools
        ? Object.entries(mcpTools).map(([name, tool]) => ({
            name,
            description: (tool as any).description,
          }))
        : [],
    });
  });
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
      const { messages, sessionId, provider = 'openai' } = request.body;

      let customOllama = createOllama({
        baseURL: OLLAMA_HOST + '/api',
      });

      try {
        // Use MCP tools directly from Vercel AI SDK
        const tools = mcpTools || {};

        if (!mcpTools || Object.keys(tools).length === 0) {
          fastify.log.info('MCP tools not available - running without tools');
        } else {
          fastify.log.info(`Using ${Object.keys(tools).length} MCP tools from Vercel AI SDK`);
        }
        // Create the stream
        const streamConfig = {
          model: provider === 'ollama' ? customOllama('llama3.1:8b') : openai('gpt-4o'),
          messages: convertToModelMessages(messages),
          tools: Object.keys(tools).length > 0 ? tools : undefined,
          // maxSteps: 5, // Allow multiple tool calls
          experimental_transform: smoothStream({
            delayInMs: 20, // optional: defaults to 10ms
            chunking: 'line', // optional: defaults to 'word'
          }),
          onError({ error }) {
            console.error(error); // your error logging logic here
          },
        };

        fastify.log.info(`Starting LLM stream with ${Object.keys(tools).length} tools`);

        const result = streamText(streamConfig);

        // If NOT using Ollama, use the proper UI stream response
        if (provider !== 'ollama') {
          fastify.log.info('Using UI stream response for tool-enabled chat (non-Ollama provider)');

          return reply.send(
            result.toUIMessageStreamResponse({
              originalMessages: messages,
              onChunk({ chunk }) {
                console.log(chunk.text);
              },
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
            if (chunk.type === 'error') {
              console.log('Error chunk:', chunk);
            } else if (chunk.type === 'text-delta') {
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
        const finalMessage = await result.text;

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

  // Cleanup MCP client on server shutdown
  fastify.addHook('onClose', async () => {
    if (mcpClient) {
      try {
        await mcpClient.close();
        console.log('MCP client closed');
      } catch (error) {
        console.error('Error closing MCP client:', error);
      }
    }
  });
};

export default llmRoutes;
