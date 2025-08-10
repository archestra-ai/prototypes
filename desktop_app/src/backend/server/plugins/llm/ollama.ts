import { type DynamicToolUIPart, type TextUIPart, type UIMessage, generateId } from 'ai';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { Message, Ollama, Tool } from 'ollama';

import config from '@backend/config';
import Chat from '@backend/models/chat';

import { mcpTools as globalMcpTools, initMCP } from './index';

interface StreamRequestBody {
  model: string;
  messages: UIMessage[];
  sessionId?: string;
}

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

        const ollama = new Ollama({ host: config.ollama.server.host });

        // Convert MCP tools to Ollama format
        const ollamaTools: Tool[] = [];
        if (globalMcpTools && Object.keys(globalMcpTools).length > 0) {
          for (const [name, tool] of Object.entries(globalMcpTools)) {
            const mcpTool = tool as any;

            // Extract the JSON schema from the MCP tool
            // MCP tools from Vercel AI SDK have inputSchema.jsonSchema structure
            const toolParameters = mcpTool.inputSchema?.jsonSchema ||
              mcpTool.inputSchema ||
              mcpTool.parameters || {
                type: 'object',
                properties: {},
                required: [],
              };

            ollamaTools.push({
              type: 'function',
              function: {
                name,
                description: mcpTool.description || '',
                parameters: toolParameters,
              },
            });
          }
        } else {
          fastify.log.warn('No MCP tools available for Ollama');
        }

        // Convert UIMessage format to Ollama format
        const ollamaMessages: Message[] = messages.map((msg: UIMessage) => {
          // Extract text content from parts array
          let content = '';
          const toolCalls: any[] = [];

          if (msg.parts && Array.isArray(msg.parts)) {
            for (const part of msg.parts) {
              if (part.type === 'text') {
                content += (part as TextUIPart).text;
              } else if (part.type === 'dynamic-tool') {
                const toolPart = part as DynamicToolUIPart;
                // Extract tool information from DynamicToolUIPart
                if (toolPart.state === 'input-available' || toolPart.state === 'output-available') {
                  toolCalls.push({
                    id: toolPart.toolCallId,
                    type: 'function',
                    function: {
                      name: toolPart.toolName,
                      arguments:
                        typeof toolPart.input === 'string' ? toolPart.input : JSON.stringify(toolPart.input || {}),
                    },
                  });
                }
              }
            }
          }

          const message: Message = {
            role: msg.role,
            content: content || '',
          };

          // Add tool calls if present
          if (toolCalls.length > 0) {
            message.tool_calls = toolCalls;
          }

          return message;
        });

        const messageId = generateId();
        let fullContent = '';
        let isFirstChunk = true;
        let currentToolCalls: any[] = [];
        let accumulatedToolArgs: { [key: string]: string } = {};
        let hasStartedText = false;
        let isProcessingToolCall = false;

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
          if (
            lastMessage &&
            lastMessage.content &&
            (lastMessage.content.toLowerCase().includes('call') ||
              lastMessage.content.toLowerCase().includes('use') ||
              lastMessage.content.toLowerCase().includes('execute') ||
              lastMessage.content.toLowerCase().includes('printenv'))
          ) {
            // Add tool_choice to encourage tool use
            chatRequest.tool_choice = 'auto';
          }
        }

        const response = await ollama.chat(chatRequest);

        // Send start message
        reply.raw.write(`data: {"type":"start"}\n\n`);

        // Process the stream
        for await (const chunk of response) {
          // Handle tool calls first to set the flag
          if (chunk.message?.tool_calls && chunk.message.tool_calls.length > 0) {
            isProcessingToolCall = true;
            for (const toolCall of chunk.message.tool_calls) {
              const toolCallId = generateId();

              // Check if this is a new tool call or continuation
              if (toolCall.function?.name) {
                // New tool call - send tool-input-start
                reply.raw.write(
                  `data: {"type":"tool-input-start","toolCallId":"${toolCallId}","toolName":"${toolCall.function.name}"}\n\n`
                );

                // Initialize accumulator for this tool call
                const argsString =
                  typeof toolCall.function.arguments === 'object'
                    ? JSON.stringify(toolCall.function.arguments)
                    : toolCall.function.arguments || '';
                accumulatedToolArgs[toolCallId] = argsString;

                // Send the arguments as delta if present
                if (argsString) {
                  const escapedArgs = argsString.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
                  reply.raw.write(
                    `data: {"type":"tool-input-delta","toolCallId":"${toolCallId}","inputTextDelta":"${escapedArgs}"}\n\n`
                  );
                }

                // Store tool call info
                currentToolCalls.push({
                  toolCallId,
                  toolName: toolCall.function.name,
                  args: {},
                  result: null, // Will be populated when tool executes
                });
              } else if (toolCall.function?.arguments && currentToolCalls.length > 0) {
                // Continuation of arguments for the last tool call
                const lastToolCall = currentToolCalls[currentToolCalls.length - 1];
                accumulatedToolArgs[lastToolCall.toolCallId] += toolCall.function.arguments;

                const escapedArgs = toolCall.function.arguments
                  .replace(/\\/g, '\\\\')
                  .replace(/"/g, '\\"')
                  .replace(/\n/g, '\\n');
                reply.raw.write(
                  `data: {"type":"tool-input-delta","toolCallId":"${lastToolCall.toolCallId}","inputTextDelta":"${escapedArgs}"}\n\n`
                );
              }
            }
          }

          // Handle text content - but skip if we're processing tool calls
          if (chunk.message?.content && !isProcessingToolCall) {
            // Send text-start on first text chunk
            if (!hasStartedText) {
              reply.raw.write(`data: {"type":"text-start","id":"${messageId}"}\n\n`);
              hasStartedText = true;
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

          // Check if this is the end of a tool call
          if (chunk.done && currentToolCalls.length > 0) {
            // Start text if not already started (for tool-only responses)
            if (!hasStartedText) {
              reply.raw.write(`data: {"type":"text-start","id":"${messageId}"}\n\n`);
              hasStartedText = true;
            }

            // Parse and execute tool calls
            for (const toolCall of currentToolCalls) {
              try {
                // Parse the accumulated arguments
                const args = JSON.parse(accumulatedToolArgs[toolCall.toolCallId] || '{}');
                toolCall.args = args;

                // Execute the tool
                if (globalMcpTools && globalMcpTools[toolCall.toolName]) {
                  try {
                    const result = await globalMcpTools[toolCall.toolName].execute(args);

                    // Store the result in the tool call
                    toolCall.result = result;

                    // Extract the actual content from the tool result
                    let formattedOutput = '';
                    if (result && result.content && Array.isArray(result.content)) {
                      for (const item of result.content) {
                        if (item.type === 'text') {
                          formattedOutput = item.text;
                        }
                      }
                    } else {
                      formattedOutput = JSON.stringify(result, null, 2);
                    }

                    // Send tool result as formatted text message
                    const toolResultMessage = `\n\n**Tool ${toolCall.toolName} executed successfully:**\n\`\`\`json\n${formattedOutput}\n\`\`\``;
                    const escapedToolResult = toolResultMessage
                      .replace(/\\/g, '\\\\')
                      .replace(/"/g, '\\"')
                      .replace(/\n/g, '\\n')
                      .replace(/\r/g, '\\r')
                      .replace(/\t/g, '\\t');

                    // Send as text delta to be compatible with Vercel AI SDK
                    reply.raw.write(
                      `data: {"type":"text-delta","id":"${messageId}","delta":"${escapedToolResult}"}\n\n`
                    );
                  } catch (toolError) {
                    // Store error in tool call
                    toolCall.error = toolError instanceof Error ? toolError.message : 'Tool execution failed';

                    // Send tool error as text message
                    const errorMsg = toolError instanceof Error ? toolError.message : 'Tool execution failed';
                    const errorMessage = `\n\nTool ${toolCall.toolName} failed: ${errorMsg}`;
                    const escapedError = errorMessage
                      .replace(/\\/g, '\\\\')
                      .replace(/"/g, '\\"')
                      .replace(/\n/g, '\\n')
                      .replace(/\r/g, '\\r')
                      .replace(/\t/g, '\\t');
                    reply.raw.write(`data: {"type":"text-delta","id":"${messageId}","delta":"${escapedError}"}\n\n`);
                  }
                } else {
                  // Tool not found - send as text message
                  const notFoundMessage = `\n\nTool ${toolCall.toolName} not found`;
                  const escapedNotFound = notFoundMessage
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t');
                  reply.raw.write(`data: {"type":"text-delta","id":"${messageId}","delta":"${escapedNotFound}"}\n\n`);
                }
              } catch (parseError) {
                // Failed to parse arguments - send as text message
                const parseErrorMessage = `\n\nTool ${toolCall.toolCallId} failed: Invalid tool arguments`;
                const escapedParseError = parseErrorMessage
                  .replace(/\\/g, '\\\\')
                  .replace(/"/g, '\\"')
                  .replace(/\n/g, '\\n')
                  .replace(/\r/g, '\\r')
                  .replace(/\t/g, '\\t');
                reply.raw.write(`data: {"type":"text-delta","id":"${messageId}","delta":"${escapedParseError}"}\n\n`);
              }
            }
          }
        }

        // Send text-end if we started text
        if (hasStartedText) {
          reply.raw.write(`data: {"type":"text-end","id":"${messageId}"}\n\n`);
        }

        // Save messages before finishing
        if (sessionId) {
          // Build UIMessage with parts array
          const parts: Array<TextUIPart | DynamicToolUIPart> = [];

          // Add text content as TextUIPart
          if (fullContent) {
            parts.push({
              type: 'text',
              text: fullContent,
            } as TextUIPart);
          }

          // Add tool calls as DynamicToolUIPart
          for (const toolCall of currentToolCalls) {
            const toolPart: DynamicToolUIPart = {
              type: 'dynamic-tool',
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              input: toolCall.args,
            } as DynamicToolUIPart;

            // Set state and output based on whether there was an error
            if (toolCall.error) {
              (toolPart as any).state = 'output-error';
              (toolPart as any).errorText = toolCall.error;
            } else {
              (toolPart as any).state = 'output-available';
              (toolPart as any).output = toolCall.result || {};
            }

            parts.push(toolPart);
          }

          const assistantMessage: UIMessage = {
            id: messageId,
            role: 'assistant',
            parts,
          };

          const finalMessages = [...messages, assistantMessage];
          await Chat.saveMessages(sessionId, finalMessages);
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
