import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Message as OllamaMessage, Tool as OllamaTool } from 'ollama/browser';
import { create } from 'zustand';

import { ChatMessage, ToolCallInfo } from '../types';
import { useMCPServersStore } from './mcp-servers-store';
import { useOllamaStore } from './ollama-store';

interface ParsedContent {
  thinking: string;
  response: string;
  isThinkingStreaming: boolean;
}

interface ToolWithServerName {
  serverName: string;
  tool: Tool;
}

interface ChatState {
  chatHistory: ChatMessage[];
  isChatLoading: boolean;
  streamingMessageId: string | null;
  abortController: AbortController | null;
}

interface ChatActions {
  sendChatMessage: (message: string, model: string) => Promise<void>;
  clearChatHistory: () => void;
  cancelStreaming: () => void;
  updateStreamingMessage: (messageId: string, content: string) => void;
}

type ChatStore = ChatState & ChatActions;

export function checkModelSupportsTools(model: string): boolean {
  return (
    model.includes('functionary') ||
    model.includes('mistral') ||
    model.includes('command') ||
    (model.includes('qwen') && !model.includes('0.6b')) ||
    model.includes('hermes') ||
    model.includes('llama3.1') ||
    model.includes('llama-3.1') ||
    model.includes('phi') ||
    model.includes('granite')
  );
}

export function addCancellationText(content: string): string {
  return content.includes('[Cancelled]') ? content : content + ' [Cancelled]';
}

export function markMessageAsCancelled(message: ChatMessage): ChatMessage {
  return {
    ...message,
    isStreaming: false,
    isToolExecuting: false,
    isThinkingStreaming: false,
    content: addCancellationText(message.content),
  };
}

export function parseThinkingContent(content: string): ParsedContent {
  if (!content) {
    return { thinking: '', response: '', isThinkingStreaming: false };
  }

  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;

  let thinking = '';
  let response = content;
  let isThinkingStreaming = false;

  const completedMatches = [...content.matchAll(thinkRegex)];
  const completedThinking = completedMatches.map((match) => match[1]).join('\n\n');

  let contentWithoutCompleted = content.replace(thinkRegex, '');

  const incompleteMatch = contentWithoutCompleted.match(/<think>([\s\S]*)$/);

  if (incompleteMatch) {
    const incompleteThinking = incompleteMatch[1];
    const beforeIncomplete = contentWithoutCompleted.substring(0, contentWithoutCompleted.indexOf('<think>'));

    thinking = completedThinking ? `${completedThinking}\n\n${incompleteThinking}` : incompleteThinking;
    response = beforeIncomplete.trim();
    isThinkingStreaming = true;
  } else {
    thinking = completedThinking;
    response = contentWithoutCompleted.trim();
    isThinkingStreaming = false;
  }

  if (thinking && process.env.NODE_ENV === 'development') {
    console.log('🧠 Thinking parsed:', {
      hasCompleted: completedMatches.length > 0,
      hasIncomplete: !!incompleteMatch,
      thinkingLength: thinking.length,
      responseLength: response.length,
      isStreaming: isThinkingStreaming,
    });
  }

  return {
    thinking,
    response,
    isThinkingStreaming,
  };
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  chatHistory: [],
  isChatLoading: false,
  streamingMessageId: null,
  abortController: null,

  // Actions
  clearChatHistory: () => {
    set({ chatHistory: [] });
  },

  cancelStreaming: () => {
    try {
      console.log('🛑 Cancelling streaming');

      const { abortController, streamingMessageId } = get();
      if (abortController) {
        abortController.abort();
        set({ abortController: null });
        console.log('✅ Streaming cancelled');
      }

      // Reset state immediately
      set({ isChatLoading: false, streamingMessageId: null });

      // Clear any stuck execution states from the currently streaming message
      set((state) => ({
        chatHistory: state.chatHistory.map((msg) =>
          msg.id === streamingMessageId || msg.isStreaming || msg.isToolExecuting
            ? {
                ...msg,
                isStreaming: false,
                isToolExecuting: false,
                isThinkingStreaming: false,
              }
            : msg
        ),
      }));
    } catch (error) {
      console.error('Failed to cancel streaming:', error);
      // Still reset state even if cancellation failed
      set({ isChatLoading: false, streamingMessageId: null });

      const { streamingMessageId } = get();
      set((state) => ({
        chatHistory: state.chatHistory.map((msg) =>
          msg.id === streamingMessageId || msg.isStreaming || msg.isToolExecuting ? markMessageAsCancelled(msg) : msg
        ),
      }));
    }
  },

  updateStreamingMessage: (messageId: string, content: string) => {
    const parsed = parseThinkingContent(content);
    set((state) => ({
      chatHistory: state.chatHistory.map((msg) =>
        msg.id === messageId && msg.isStreaming
          ? {
              ...msg,
              content: parsed.response,
              thinkingContent: parsed.thinking,
              isThinkingStreaming: parsed.isThinkingStreaming,
            }
          : msg
      ),
    }));
  },

  sendChatMessage: async (message: string, model: string) => {
    const ollamaClient = useOllamaStore.getState().ollamaClient;
    const { installedMCPServers, executeTool } = useMCPServersStore.getState();

    if (!message.trim() || !ollamaClient) return;

    set({ isChatLoading: true });

    const userMsgId = Date.now().toString();
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    set((state) => ({
      chatHistory: [...state.chatHistory, userMessage],
    }));

    const aiMsgId = (Date.now() + 1).toString();
    const aiMessage: ChatMessage = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      thinkingContent: '',
      timestamp: new Date(),
      isStreaming: true,
      isThinkingStreaming: false,
    };

    set((state) => ({
      chatHistory: [...state.chatHistory, aiMessage],
      streamingMessageId: aiMsgId,
    }));

    try {
      const modelSupportsTools = checkModelSupportsTools(model);

      // Collect all tools from all MCP servers
      const allTools: ToolWithServerName[] = [];
      installedMCPServers.forEach((server) => {
        server.tools.forEach((tool) => {
          allTools.push({
            serverName: server.name,
            tool,
          });
        });
      });

      console.log('🔧 Tool calling debug:', {
        mcpToolsCount: installedMCPServers.length,
        modelSupportsTools,
        model,
        willUseMcpTools: installedMCPServers.length > 0 && modelSupportsTools,
      });

      // Add warning if tools are available but model doesn't support them
      if (allTools.length > 0 && !modelSupportsTools) {
        const warningMessage: ChatMessage = {
          id: (Date.now() + Math.random()).toString(),
          role: 'system',
          content: `⚠️ MCP tools are available but ${model} doesn't support tool calling. Consider using functionary-small-v3.2 or another tool-enabled model.`,
          timestamp: new Date(),
        };
        set((state) => ({
          chatHistory: [...state.chatHistory, warningMessage],
        }));
      }

      // Prepare chat history for Ollama SDK
      const ollamaMessages: OllamaMessage[] = [
        ...get()
          .chatHistory.filter((msg) => msg.role === 'user' || msg.role === 'assistant')
          .map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
        { role: 'user', content: message },
      ];

      // Convert MCP tools to Ollama tool format
      const tools =
        allTools.length > 0 && modelSupportsTools
          ? allTools.map(({ serverName, tool }) => ({
              type: 'function',
              function: {
                name: `${serverName}_${tool.name}`,
                description: tool.description || `Tool from ${serverName}`,
                parameters: tool.inputSchema as OllamaTool['function']['parameters'],
              },
            }))
          : undefined;

      console.log('📡 Starting Ollama SDK streaming chat...');
      console.log('🔧 Tools available:', tools?.length || 0, tools?.map((t) => t.function.name) || []);

      const controller = new AbortController();
      set({ abortController: controller });

      const response = await ollamaClient.chat({
        model: model,
        messages: ollamaMessages,
        stream: true,
        tools: tools,
        options: {
          temperature: 0.7,
          top_p: 0.95,
          top_k: 40,
          num_predict: 32768,
        },
      });

      let accumulatedContent = '';
      let finalMessage: any = null;

      // Stream the initial response
      for await (const part of response) {
        if (controller.signal.aborted) {
          console.log('Streaming cancelled by user');
          break;
        }

        if (part.message?.content) {
          accumulatedContent += part.message.content;
          get().updateStreamingMessage(aiMsgId, accumulatedContent);
        }

        if (part.done) {
          finalMessage = part.message;
          console.log('🏁 Final message received:', JSON.stringify(finalMessage, null, 2));
          break;
        }
      }

      // Handle tool calls if present
      if (finalMessage?.tool_calls && executeTool) {
        console.log('🔧 Tool calls received:', finalMessage.tool_calls);

        // Mark message as executing tools
        set((state) => ({
          chatHistory: state.chatHistory.map((msg) =>
            msg.id === aiMsgId
              ? {
                  ...msg,
                  isToolExecuting: true,
                  content: accumulatedContent,
                }
              : msg
          ),
        }));

        // Execute tools and collect results
        const toolResults: ToolCallInfo[] = [];
        for (const toolCall of finalMessage.tool_calls) {
          try {
            const functionName = toolCall.function.name;
            const args =
              typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments;

            console.log('🚀 Executing tool:', functionName, 'with args:', args);

            // Find the matching MCP tool to get the correct server name
            const matchingTool = allTools.find((tool) => `${tool.serverName}_${tool.tool.name}` === functionName);

            const serverName = matchingTool?.serverName || 'unknown';
            const toolName = matchingTool?.tool.name || functionName;

            // Execute the MCP tool
            const result = await executeTool(serverName, {
              name: toolName,
              arguments: args,
            });
            const toolResultContent = typeof result === 'string' ? result : JSON.stringify(result);

            toolResults.push({
              id: toolCall.id,
              serverName,
              toolName,
              arguments: args,
              result: toolResultContent,
              status: 'completed' as const,
              executionTime: 0,
              startTime: new Date(),
              endTime: new Date(),
            });

            // Add tool result to conversation
            ollamaMessages.push(finalMessage);
            ollamaMessages.push({
              role: 'tool',
              content: toolResultContent,
            });
          } catch (error) {
            console.error('❌ Tool execution error:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorFunctionName = toolCall.function.name;

            // Find the matching MCP tool to get the correct server name
            const errorMatchingTool = allTools.find(
              (tool) => `${tool.serverName}_${tool.tool.name}` === errorFunctionName
            );

            const errorServerName = errorMatchingTool?.serverName || 'unknown';
            const errorToolName = errorMatchingTool?.tool.name || errorFunctionName;

            toolResults.push({
              id: toolCall.id,
              serverName: errorServerName,
              toolName: errorToolName,
              arguments:
                typeof toolCall.function.arguments === 'string'
                  ? JSON.parse(toolCall.function.arguments)
                  : toolCall.function.arguments,
              result: '',
              error: errorMsg,
              status: 'error' as const,
              executionTime: 0,
              startTime: new Date(),
              endTime: new Date(),
            });
          }
        }

        // Update message with tool results
        set((state) => ({
          chatHistory: state.chatHistory.map((msg) =>
            msg.id === aiMsgId
              ? {
                  ...msg,
                  isToolExecuting: false,
                  toolCalls: toolResults,
                }
              : msg
          ),
        }));

        // Get final response from model after tool execution
        if (toolResults.some((tr) => tr.status === 'completed')) {
          console.log('🔄 Getting final response after tool execution...');

          const finalResponse = await ollamaClient.chat({
            model: model,
            messages: ollamaMessages,
            stream: true,
            options: {
              temperature: 0.7,
              top_p: 0.95,
              top_k: 40,
              num_predict: 32768,
            },
          });

          let finalContent = '';
          for await (const part of finalResponse) {
            if (controller.signal.aborted) break;

            if (part.message?.content) {
              finalContent += part.message.content;
              get().updateStreamingMessage(aiMsgId, accumulatedContent + '\n\n' + finalContent);
            }

            if (part.done) {
              set((state) => ({
                chatHistory: state.chatHistory.map((msg) =>
                  msg.id === aiMsgId
                    ? {
                        ...msg,
                        content: accumulatedContent + '\n\n' + finalContent,
                        isStreaming: false,
                        isThinkingStreaming: false,
                      }
                    : msg
                ),
              }));
              break;
            }
          }
        }
      } else {
        // No tool calls, just finalize the message
        set((state) => ({
          chatHistory: state.chatHistory.map((msg) =>
            msg.id === aiMsgId
              ? {
                  ...msg,
                  isStreaming: false,
                  isThinkingStreaming: false,
                }
              : msg
          ),
        }));
      }

      set({ streamingMessageId: null, abortController: null });
    } catch (error: any) {
      console.error('Chat error:', error);

      const { abortController } = get();

      // Handle abort specifically
      if (error.name === 'AbortError' || abortController?.signal.aborted) {
        console.log('Streaming cancelled by user');
        set((state) => ({
          chatHistory: state.chatHistory.map((msg) => (msg.id === aiMsgId ? markMessageAsCancelled(msg) : msg)),
        }));
      } else {
        const errorMsg = error instanceof Error ? error.message : 'An unknown error occurred';
        set((state) => ({
          chatHistory: state.chatHistory.map((msg) =>
            msg.id === aiMsgId
              ? {
                  ...msg,
                  content: `Error: ${errorMsg}`,
                  isStreaming: false,
                  isThinkingStreaming: false,
                }
              : msg
          ),
        }));
      }
      set({ streamingMessageId: null, abortController: null });
    }

    set({ isChatLoading: false });
  },
}));

// Computed selectors
export const useIsStreaming = () => useChatStore((state) => state.streamingMessageId !== null);
