import { type DynamicToolUIPart, type TextUIPart, type UIMessage, generateId } from 'ai';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Message, Ollama, Tool } from 'ollama';

import config from '@backend/config';
import Chat from '@backend/models/chat';

interface StreamRequestBody {
  model: string;
  messages: Array<any>;
  sessionId?: string;
  provider?: string;
}

// Helper function to escape content for JSON
function escapeJsonString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export async function handleOllamaStream(
  fastify: any,
  request: FastifyRequest<{ Body: StreamRequestBody }>,
  reply: FastifyReply,
  mcpTools: any
) {
  const { messages, sessionId, model = 'llama3.1:8b' } = request.body;

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
  if (mcpTools && Object.keys(mcpTools).length > 0) {
    for (const [name, tool] of Object.entries(mcpTools)) {
      const mcpTool = tool as any;

      // Extract the JSON schema from the MCP tool
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
  const ollamaMessages: Message[] = (messages as UIMessage[]).map((msg: UIMessage) => {
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
                arguments: typeof toolPart.input === 'string' ? toolPart.input : JSON.stringify(toolPart.input || {}),
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
  let accumulatedThinkContent = '';

  try {
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
        chatRequest.tool_choice = 'auto';
      }
    }

    const response = await ollama.chat(chatRequest);

    // Send start message
    reply.raw.write(`data: {"type":"start"}\n\n`);

    // Process the stream
    for await (const chunk of response) {
      // Check if this chunk contains tool calls
      const hasToolCallsInChunk = chunk.message?.tool_calls && chunk.message.tool_calls.length > 0;

      // Handle tool calls - accumulate them but don't send events yet
      if (hasToolCallsInChunk) {
        isProcessingToolCall = true;

        for (const toolCall of chunk.message.tool_calls) {
          // Check if this is a new tool call or continuation
          if (toolCall.function?.name) {
            const toolCallId = generateId();

            // Initialize accumulator for this tool call
            const argsString =
              typeof toolCall.function.arguments === 'object'
                ? JSON.stringify(toolCall.function.arguments)
                : toolCall.function.arguments || '';
            accumulatedToolArgs[toolCallId] = argsString;

            // Store tool call info (don't send events yet)
            currentToolCalls.push({
              toolCallId,
              toolName: toolCall.function.name,
              args: {},
              result: null,
            });
          } else if (toolCall.function?.arguments && currentToolCalls.length > 0) {
            // Continuation of arguments for the last tool call
            const lastToolCall = currentToolCalls[currentToolCalls.length - 1];
            const argsString =
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments);
            accumulatedToolArgs[lastToolCall.toolCallId] =
              (accumulatedToolArgs[lastToolCall.toolCallId] || '') + argsString;
          }
        }
      }

      // Handle text content - but skip if we're processing tool calls
      if (chunk.message?.content && !isProcessingToolCall) {
        const content = chunk.message.content;

        // Only start text stream if we have non-whitespace content
        if (!hasStartedText && content.trim()) {
          // Send start-step event before text
          reply.raw.write(`data: {"type":"start-step"}\n\n`);
          reply.raw.write(`data: {"type":"text-start","id":"${messageId}"}\n\n`);
          hasStartedText = true;
          isFirstChunk = false;
        }

        // If text has started, send all content including whitespace
        if (hasStartedText) {
          fullContent += content;

          // Keep track of think content for later processing if needed
          if (content.includes('<think>') || content.includes('</think>')) {
            accumulatedThinkContent += content;
          }

          // Send the content as-is (including think blocks)
          // The frontend will parse and display them appropriately
          const escapedContent = escapeJsonString(content);
          reply.raw.write(`data: {"type":"text-delta","id":"${messageId}","delta":"${escapedContent}"}\n\n`);
        }
      }

      // Check if this is the end of a tool call
      if (chunk.done && currentToolCalls.length > 0) {
        // If we were outputting text, close it before executing tool calls
        if (hasStartedText) {
          reply.raw.write(`data: {"type":"text-end","id":"${messageId}"}\n\n`);
          // Send finish-step event after text
          reply.raw.write(`data: {"type":"finish-step"}\n\n`);
          hasStartedText = false;
        }

        // Now send tool events and execute tool calls
        for (const toolCall of currentToolCalls) {
          try {
            // Send start-step event before tool events
            reply.raw.write(`data: {"type":"start-step"}\n\n`);

            // Send tool-input-start event with dynamic flag
            reply.raw.write(
              `data: {"type":"tool-input-start","toolCallId":"${toolCall.toolCallId}","toolName":"${toolCall.toolName}","dynamic":true}\n\n`
            );

            // Send tool-input-delta event with accumulated arguments
            const argsString = accumulatedToolArgs[toolCall.toolCallId] || '{}';
            const escapedArgsDelta = escapeJsonString(argsString);
            reply.raw.write(
              `data: {"type":"tool-input-delta","toolCallId":"${toolCall.toolCallId}","inputTextDelta":"${escapedArgsDelta}"}\n\n`
            );

            // Parse the accumulated arguments
            const args = JSON.parse(argsString);
            toolCall.args = args;

            // Send tool-input-available event with dynamic flag
            reply.raw.write(
              `data: {"type":"tool-input-available","toolCallId":"${toolCall.toolCallId}","toolName":"${toolCall.toolName}","input":${JSON.stringify(args)},"dynamic":true}\n\n`
            );

            // Execute the tool
            if (mcpTools && mcpTools[toolCall.toolName]) {
              try {
                const result = await mcpTools[toolCall.toolName].execute(args);

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

                // Send tool output available event with dynamic flag
                reply.raw.write(
                  `data: {"type":"tool-output-available","toolCallId":"${toolCall.toolCallId}","output":${JSON.stringify(result)},"dynamic":true}\n\n`
                );

                // Send finish-step event after tool output
                reply.raw.write(`data: {"type":"finish-step"}\n\n`);
              } catch (toolError) {
                // Store error in tool call
                toolCall.error = toolError instanceof Error ? toolError.message : 'Tool execution failed';

                // Send tool error event
                const errorMsg = toolError instanceof Error ? toolError.message : 'Tool execution failed';
                const escapedError = escapeJsonString(errorMsg);
                reply.raw.write(
                  `data: {"type":"tool-output-error","toolCallId":"${toolCall.toolCallId}","errorText":"${escapedError}"}\n\n`
                );

                // Send finish-step event after tool error
                reply.raw.write(`data: {"type":"finish-step"}\n\n`);
              }
            } else {
              // Tool not found - send error event
              const escapedError = escapeJsonString(`Tool ${toolCall.toolName} not found`);
              reply.raw.write(
                `data: {"type":"tool-output-error","toolCallId":"${toolCall.toolCallId}","errorText":"${escapedError}"}\n\n`
              );

              // Send finish-step event after tool error
              reply.raw.write(`data: {"type":"finish-step"}\n\n`);
            }
          } catch (parseError) {
            // Failed to parse arguments - send error event
            const escapedError = escapeJsonString('Invalid tool arguments');
            reply.raw.write(
              `data: {"type":"tool-output-error","toolCallId":"${toolCall.toolCallId}","errorText":"${escapedError}"}\n\n`
            );

            // Send finish-step event after parse error
            reply.raw.write(`data: {"type":"finish-step"}\n\n`);
          }
        }
      }
    }

    // Send text-end if we started text and haven't closed it yet
    if (hasStartedText) {
      reply.raw.write(`data: {"type":"text-end","id":"${messageId}"}\n\n`);
      // Send finish-step event after text
      reply.raw.write(`data: {"type":"finish-step"}\n\n`);
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

      const finalMessages = [...(messages as UIMessage[]), assistantMessage];
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
        const escapedErrorMessage = escapeJsonString(errorMessage);
        reply.raw.write(`data: {"type":"error","errorText":"${escapedErrorMessage}"}\n\n`);
        reply.raw.end();
      } catch (writeError) {
        // If writing fails, just log it
        fastify.log.error('Failed to write error to stream:', writeError);
      }
    }
  }
}
