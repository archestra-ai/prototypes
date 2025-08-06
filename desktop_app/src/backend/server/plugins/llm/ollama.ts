import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { Ollama, Message, Tool } from 'ollama';
import { generateId } from 'ai';

import { chatService } from '@backend/models/chat';
import { mcpTools as globalMcpTools, initMCP } from './index';

interface StreamRequestBody {
  model: string;
  messages: Array<any>;
  sessionId?: string;
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

const ollamaLLMRoutes: FastifyPluginAsync = async (fastify) => {
  // Initialize MCP on plugin registration if not already done
  if (!globalMcpTools) {
    fastify.log.info('Initializing MCP tools for Ollama...');
    await initMCP();
    fastify.log.info(`MCP tools initialized with ${globalMcpTools ? Object.keys(globalMcpTools).length : 0} tools`);
  } else {
    fastify.log.info(`MCP tools already available with ${Object.keys(globalMcpTools).length} tools`);
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
      
      fastify.log.info('Ollama stream request:', {
        model,
        sessionId,
        messageCount: messages?.length || 0,
      });

      try {
        // Hijack the response to handle it manually
        reply.hijack();
        
        // Set CORS headers
        reply.raw.setHeader('Access-Control-Allow-Origin', '*');
        reply.raw.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        reply.raw.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
        
        // Set SSE headers
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no');
        
        // Write the status code
        reply.raw.writeHead(200);

        const ollama = new Ollama({ host: OLLAMA_HOST });
        
        // Convert MCP tools to Ollama format
        const ollamaTools: Tool[] = [];
        if (globalMcpTools && Object.keys(globalMcpTools).length > 0) {
          for (const [name, tool] of Object.entries(globalMcpTools)) {
            const mcpTool = tool as any;
            ollamaTools.push({
              type: 'function',
              function: {
                name,
                description: mcpTool.description || '',
                parameters: mcpTool.parameters || {
                  type: 'object',
                  properties: {},
                },
              },
            });
          }
          fastify.log.info(`Using ${ollamaTools.length} MCP tools with Ollama`);
          fastify.log.info(`Tool names: ${ollamaTools.map(t => t.function.name).join(', ')}`);
        } else {
          fastify.log.warn('No MCP tools available for Ollama');
        }
        
        // Convert messages to Ollama format with tool calls
        const ollamaMessages: Message[] = messages.map((msg: any) => {
          // Extract content from parts array if present
          let content = msg.content || '';
          if (!content && msg.parts && Array.isArray(msg.parts)) {
            const textParts = msg.parts.filter((p: any) => p.type === 'text');
            content = textParts.map((p: any) => p.text).join('');
          }
          
          const message: Message = {
            role: msg.role,
            content: content,
          };
          
          // Handle tool calls in messages
          if (msg.toolInvocations && msg.toolInvocations.length > 0) {
            message.tool_calls = msg.toolInvocations.map((invocation: any) => ({
              id: invocation.toolCallId,
              type: 'function',
              function: {
                name: invocation.toolName,
                arguments: JSON.stringify(invocation.args),
              },
            }));
          }
          
          // Handle tool results
          if (msg.role === 'tool') {
            message.role = 'tool';
          }
          
          return message;
        });

        const messageId = generateId();
        let fullContent = '';
        let isFirstChunk = true;
        let currentToolCalls: any[] = [];
        let accumulatedToolArgs: { [key: string]: string } = {};

        // Log the request for debugging
        fastify.log.info('Ollama chat request:', {
          model,
          messageCount: ollamaMessages.length,
          toolCount: ollamaTools.length,
          hasTools: ollamaTools.length > 0,
          toolsProvided: ollamaTools.length > 0 ? 'yes' : 'no',
          messages: ollamaMessages,
          lastMessage: ollamaMessages[ollamaMessages.length - 1]?.content
        });
        
        // Debug: Log first tool to see format
        if (ollamaTools.length > 0) {
          fastify.log.info('First tool example:', JSON.stringify(ollamaTools[0], null, 2));
        }
        
        // Start streaming
        const chatRequest: any = {
          model,
          messages: ollamaMessages,
          stream: true,
        };
        
        // Add tools if available
        if (ollamaTools.length > 0) {
          chatRequest.tools = ollamaTools;
          // Force tool use with a system message if last message asks for a tool
          const lastMessage = ollamaMessages[ollamaMessages.length - 1];
          if (lastMessage && lastMessage.content && 
              (lastMessage.content.toLowerCase().includes('call') || 
               lastMessage.content.toLowerCase().includes('use') ||
               lastMessage.content.toLowerCase().includes('execute') ||
               lastMessage.content.toLowerCase().includes('printenv'))) {
            // Add tool_choice to encourage tool use
            chatRequest.tool_choice = 'auto';
          }
        }
        
        fastify.log.info('Sending to Ollama:', { 
          hasTools: !!chatRequest.tools,
          toolCount: chatRequest.tools?.length,
          messageCount: ollamaMessages.length,
          lastMessage: ollamaMessages[ollamaMessages.length - 1]
        });
        
        const response = await ollama.chat(chatRequest);

        // Send start message
        reply.raw.write(`data: {"type":"start"}\n\n`);

        // Process the stream
        for await (const chunk of response) {
          // Debug log the chunk
          if (chunk.message?.tool_calls) {
            fastify.log.info('🔧 Tool calls in chunk:', JSON.stringify(chunk.message.tool_calls));
          }
          if (chunk.done && chunk.message) {
            fastify.log.info('📋 Final message:', JSON.stringify(chunk.message));
          }
          
          // Handle text content
          if (chunk.message?.content) {
            // Send text-start on first text chunk
            if (isFirstChunk) {
              reply.raw.write(`data: {"type":"text-start","id":"${messageId}"}\n\n`);
              isFirstChunk = false;
            }
            
            fullContent += chunk.message.content;
            
            // Escape the content properly for JSON
            const escapedContent = chunk.message.content
              .replace(/\\/g, '\\\\')
              .replace(/"/g, '\\"')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r')
              .replace(/\t/g, '\\t');
            
            // Send text delta with id
            reply.raw.write(`data: {"type":"text-delta","id":"${messageId}","delta":"${escapedContent}"}\n\n`);
          }
          
          // Handle tool calls
          if (chunk.message?.tool_calls && chunk.message.tool_calls.length > 0) {
            for (const toolCall of chunk.message.tool_calls) {
              const toolCallId = generateId();
              
              // Check if this is a new tool call or continuation
              if (toolCall.function?.name) {
                // New tool call - send tool-input-start
                reply.raw.write(`data: {"type":"tool-input-start","toolCallId":"${toolCallId}","toolName":"${toolCall.function.name}"}\n\n`);
                
                // Initialize accumulator for this tool call
                const argsString = typeof toolCall.function.arguments === 'object' 
                  ? JSON.stringify(toolCall.function.arguments)
                  : toolCall.function.arguments || '';
                accumulatedToolArgs[toolCallId] = argsString;
                
                // Send the arguments as delta if present
                if (argsString) {
                  const escapedArgs = argsString
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/\n/g, '\\n');
                  reply.raw.write(`data: {"type":"tool-input-delta","toolCallId":"${toolCallId}","inputTextDelta":"${escapedArgs}"}\n\n`);
                }
                
                // Store tool call info
                currentToolCalls.push({
                  toolCallId,
                  toolName: toolCall.function.name,
                  args: {},
                });
              } else if (toolCall.function?.arguments && currentToolCalls.length > 0) {
                // Continuation of arguments for the last tool call
                const lastToolCall = currentToolCalls[currentToolCalls.length - 1];
                accumulatedToolArgs[lastToolCall.toolCallId] += toolCall.function.arguments;
                
                const escapedArgs = toolCall.function.arguments
                  .replace(/\\/g, '\\\\')
                  .replace(/"/g, '\\"')
                  .replace(/\n/g, '\\n');
                reply.raw.write(`data: {"type":"tool-input-delta","toolCallId":"${lastToolCall.toolCallId}","inputTextDelta":"${escapedArgs}"}\n\n`);
              }
            }
          }
          
          // Check if this is the end of a tool call
          if (chunk.done && currentToolCalls.length > 0) {
            // Parse and execute tool calls
            for (const toolCall of currentToolCalls) {
              try {
                // Parse the accumulated arguments
                const args = JSON.parse(accumulatedToolArgs[toolCall.toolCallId] || '{}');
                toolCall.args = args;
                
                // Mark tool input as available
                reply.raw.write(`data: {"type":"tool-input-available","toolCallId":"${toolCall.toolCallId}","toolName":"${toolCall.toolName}"}\n\n`);
                
                // Execute the tool
                if (globalMcpTools && globalMcpTools[toolCall.toolName]) {
                  try {
                    const result = await globalMcpTools[toolCall.toolName].execute(args);
                    
                    // Send tool output
                    const resultStr = JSON.stringify(result);
                    const escapedResult = resultStr
                      .replace(/\\/g, '\\\\')
                      .replace(/"/g, '\\"')
                      .replace(/\n/g, '\\n');
                    reply.raw.write(`data: {"type":"tool-output-available","toolCallId":"${toolCall.toolCallId}","outputText":"${escapedResult}"}\n\n`);
                  } catch (toolError) {
                    // Send tool error
                    const errorMsg = toolError instanceof Error ? toolError.message : 'Tool execution failed';
                    reply.raw.write(`data: {"type":"tool-output-error","toolCallId":"${toolCall.toolCallId}","errorText":"${errorMsg}"}\n\n`);
                  }
                } else {
                  // Tool not found
                  reply.raw.write(`data: {"type":"tool-output-error","toolCallId":"${toolCall.toolCallId}","errorText":"Tool not found"}\n\n`);
                }
              } catch (parseError) {
                // Failed to parse arguments
                reply.raw.write(`data: {"type":"tool-output-error","toolCallId":"${toolCall.toolCallId}","errorText":"Invalid tool arguments"}\n\n`);
              }
            }
          }
        }

        // Send text-end if we had any content
        if (!isFirstChunk) {
          reply.raw.write(`data: {"type":"text-end","id":"${messageId}"}\n\n`);
        }

        // Save messages before finishing
        if (sessionId) {
          const assistantMessage: any = {
            id: messageId,
            role: 'assistant',
            content: fullContent,
          };
          
          // Add tool invocations if any
          if (currentToolCalls.length > 0) {
            assistantMessage.toolInvocations = currentToolCalls;
          }
          
          const finalMessages = [...messages, assistantMessage];
          await chatService.saveMessages(sessionId, finalMessages);
        }

        // Send finish message
        reply.raw.write(`data: {"type":"finish"}\n\n`);
        
        // End the response
        reply.raw.end();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';
        
        fastify.log.error('Ollama streaming error:', {
          message: errorMessage,
          stack: errorStack,
          error: error,
        });
        
        // Check if we've already hijacked
        if (!reply.sent) {
          // If not hijacked yet, send normal error response
          return reply.code(500).send({
            error: 'Failed to stream response',
            details: errorMessage,
          });
        } else {
          // If already hijacked, try to send error in SSE format
          try {
            reply.raw.write(`data: {"type":"error","errorText":"${errorMessage}"}\n\n`);
            reply.raw.end();
          } catch (writeError) {
            // If writing fails, just log it
            fastify.log.error('Failed to write error to stream:', writeError);
          }
        }
      }
    }
  );
};

export default ollamaLLMRoutes;