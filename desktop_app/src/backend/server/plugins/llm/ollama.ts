import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { Ollama, ChatResponse, Message } from 'ollama';
import { generateId } from 'ai';

import { chatService } from '@backend/models/chat';
import { mcpTools, initMCP } from './index';

interface StreamRequestBody {
  model: string;
  messages: Array<any>;
  sessionId?: string;
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

const ollamaLLMRoutes: FastifyPluginAsync = async (fastify) => {
  // Initialize MCP if not already done
  if (!mcpTools) {
    await initMCP();
  }

  fastify.post<{ Body: StreamRequestBody }>(
    '/api/llm/ollama/stream',
    {
      schema: {
        operationId: 'streamOllamaResponse',
        description: 'Stream Ollama response',
        tags: ['LLM', 'Ollama'],
      },
    },
    async (request: FastifyRequest<{ Body: StreamRequestBody }>, reply: FastifyReply) => {
      const { messages, sessionId, model = 'llama3.1:8b' } = request.body;

      try {
        const ollama = new Ollama({ host: OLLAMA_HOST });
        
        // Convert MCP tools to Ollama format
        const tools = [];
        if (mcpTools && Object.keys(mcpTools).length > 0) {
          for (const [name, tool] of Object.entries(mcpTools)) {
            tools.push({
              type: 'function',
              function: {
                name,
                description: (tool as any).description || '',
                parameters: (tool as any).parameters || {},
              },
            });
          }
          fastify.log.info(`Using ${tools.length} MCP tools with Ollama`);
        }

        // Convert messages to Ollama format
        const ollamaMessages: Message[] = messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        }));

        // Set up SSE headers
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');

        const messageId = generateId();
        let fullContent = '';
        let toolCalls: any[] = [];

        // Start streaming
        const response = await ollama.chat({
          model,
          messages: ollamaMessages,
          tools: tools.length > 0 ? tools : undefined,
          stream: true,
        });

        // Send initial UI message stream format
        reply.raw.write(`data: {"type":"message","id":"${messageId}","role":"assistant","content":"","createdAt":"${new Date().toISOString()}"}\n\n`);

        for await (const chunk of response) {
          if (chunk.message?.content) {
            fullContent += chunk.message.content;
            // Send text delta in UI message stream format
            reply.raw.write(`data: {"type":"text","textDelta":"${chunk.message.content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"}\n\n`);
          }

          // Handle tool calls if present
          if (chunk.message?.tool_calls) {
            for (const toolCall of chunk.message.tool_calls) {
              const toolCallId = generateId();
              toolCalls.push({
                toolCallId,
                toolName: toolCall.function.name,
                args: toolCall.function.arguments,
              });

              // Send tool call in UI message stream format
              reply.raw.write(`data: {"type":"tool_call","toolCallId":"${toolCallId}","toolName":"${toolCall.function.name}"}\n\n`);
              
              // Execute the tool (simplified - in real implementation you'd call the actual MCP tool)
              const toolResult = { message: `Executed ${toolCall.function.name}` };
              
              // Send tool result
              reply.raw.write(`data: {"type":"tool_result","toolCallId":"${toolCallId}","result":${JSON.stringify(toolResult)}}\n\n`);
            }
          }
        }

        // Send finish message
        reply.raw.write(`data: {"type":"finish","finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0},"value":"${fullContent.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"}\n\n`);
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();

        // Save messages after streaming completes
        if (sessionId) {
          const assistantMessage = {
            id: messageId,
            role: 'assistant',
            content: fullContent,
            toolInvocations: toolCalls,
          };
          const finalMessages = [...messages, assistantMessage];
          await chatService.saveMessages(sessionId, finalMessages);
        }
      } catch (error) {
        fastify.log.error('Ollama streaming error:', error);
        
        // Send error in SSE format if headers were sent
        if (reply.raw.headersSent) {
          reply.raw.write(`data: {"type":"error","error":"${error instanceof Error ? error.message : 'Unknown error'}"}\n\n`);
          reply.raw.end();
        } else {
          return reply.code(500).send({
            error: 'Failed to stream response',
            details: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
  );
};

export default ollamaLLMRoutes;