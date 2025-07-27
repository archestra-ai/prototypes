import { Message as OllamaMessage, Tool as OllamaTool, ToolCall as OllamaToolCall } from 'ollama/browser';
import { create } from 'zustand';

import { DEFAULT_CHAT_TITLE } from '@/consts';
import {
  ChatWithMessages as ServerChatWithMessages,
  createChat,
  deleteChat,
  getAllChats,
  updateChat,
} from '@/lib/api-client';
import {
  checkModelSupportsTools,
  generateNewMessageCreatedAt,
  generateNewMessageId,
  generateNewToolCallId,
  initializeChat,
  markChatMessageAsCancelled,
  parseThinkingContent,
} from '@/lib/utils/chat';
import { convertMCPServerToolsToOllamaTools } from '@/lib/utils/ollama';
import { convertArchestraToolNameToServerAndToolName } from '@/lib/utils/tools';
import { websocketService } from '@/lib/websocket';
import {
  ChatMessageStatus,
  type ChatWithMessages,
  type ToolCall,
  ToolCallStatus,
  type ToolWithMCPServerName,
} from '@/types';

import { useDeveloperModeStore } from './developer-mode-store';
import { useMCPServersStore } from './mcp-servers-store';
import { useOllamaStore } from './ollama-store';

interface ChatState {
  status: ChatMessageStatus;
  chats: ChatWithMessages[];
  currentChatSessionId: string | null;
  streamingMessageId: string | null;
  abortController: AbortController | null;
  isLoadingChats: boolean;
  isLoadingMessages: boolean;
}

interface ChatActions {
  getStatus: () => ChatMessageStatus;
  setStatus: (status: ChatMessageStatus) => void;
  loadChats: () => Promise<void>;
  createNewChat: () => Promise<ChatWithMessages>;
  selectChat: (chatId: number) => void;
  getCurrentChat: () => ChatWithMessages | null;
  getCurrentChatTitle: () => string;
  deleteCurrentChat: () => Promise<void>;
  updateChat: (chatId: number, title: string) => Promise<void>;
  sendChatMessage: (message: string, selectedTools?: ToolWithMCPServerName[]) => Promise<void>;
  cancelStreaming: () => void;
  updateStreamingMessage: (messageId: string, content: string) => void;
  initializeStore: () => Promise<void>;
}

type ChatStore = ChatState & ChatActions;

/**
 * Listen for chat title updates from the backend via WebSocket
 */
const listenForChatTitleUpdates = () => {
  return websocketService.subscribe('chat-title-updated', (message) => {
    const { chat_id, title } = message.payload;
    useChatStore.setState((state) => ({
      chats: state.chats.map((chat) => (chat.id === chat_id ? { ...chat, title } : chat)),
    }));
  });
};

const executeToolsAndCollectResults = async (
  toolCalls: OllamaToolCall[],
  ollamaMessages: OllamaMessage[],
  finalMessage: OllamaMessage | null
): Promise<ToolCall[]> => {
  const { executeTool } = useMCPServersStore.getState();

  const toolResults: ToolCall[] = [];
  for (const toolCall of toolCalls) {
    const functionName = toolCall.function.name;
    const args = toolCall.function.arguments;
    const [serverName, toolName] = convertArchestraToolNameToServerAndToolName(functionName);

    try {
      const result = await executeTool(serverName, {
        name: toolName,
        arguments: args,
      });
      const toolResultContent = typeof result === 'string' ? result : JSON.stringify(result);

      toolResults.push({
        id: generateNewToolCallId(),
        serverName,
        name: toolName,
        function: toolCall.function,
        arguments: args,
        result: toolResultContent,
        status: ToolCallStatus.Completed,
        error: null,
        executionTime: null,
        startTime: new Date(),
        endTime: new Date(),
      });

      // Add tool result to conversation
      if (finalMessage) {
        ollamaMessages.push(finalMessage, {
          role: 'tool',
          content: toolResultContent,
        });
      }
    } catch (error) {
      toolResults.push({
        id: generateNewToolCallId(),
        serverName,
        name: toolName,
        function: toolCall.function,
        arguments: toolCall.function.arguments,
        result: '',
        error: error instanceof Error ? error.message : String(error),
        status: ToolCallStatus.Error,
        executionTime: null,
        startTime: new Date(),
        endTime: new Date(),
      });
    }
  }

  return toolResults;
};

export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  status: ChatMessageStatus.Ready,
  chats: [],
  currentChatSessionId: null,
  streamingMessageId: null,
  abortController: null,
  isLoadingChats: false,
  isLoadingMessages: false,

  // Actions
  loadChats: async () => {
    set({ isLoadingChats: true });
    try {
      const { data } = await getAllChats();

      if (data) {
        const initializedChats = data.map(initializeChat);

        set({
          chats: initializedChats,
          currentChatSessionId: initializedChats.length > 0 ? initializedChats[0].session_id : null,
          isLoadingChats: false,
        });
      }
    } catch (error) {
      set({ isLoadingChats: false });
    }
  },

  createNewChat: async () => {
    try {
      const response = await createChat({
        body: {
          llm_provider: 'ollama',
        },
      });
      const initializedChat = initializeChat(response.data as ServerChatWithMessages);

      set((state) => ({
        chats: [initializedChat, ...state.chats],
        currentChatSessionId: initializedChat.session_id,
      }));

      return initializedChat;
    } catch (error) {
      throw error;
    }
  },

  selectChat: (chatId: number) => {
    set({
      currentChatSessionId: get().chats.find((chat) => chat.id === chatId)?.session_id || null,
    });
  },

  getCurrentChat: () => {
    const { currentChatSessionId } = get();
    return get().chats.find((chat) => chat.session_id === currentChatSessionId) || null;
  },

  getCurrentChatTitle: () => {
    const { getCurrentChat } = get();
    return getCurrentChat()?.title || DEFAULT_CHAT_TITLE;
  },

  deleteCurrentChat: async () => {
    const { getCurrentChat } = get();
    const currentChat = getCurrentChat();
    if (!currentChat) {
      return;
    }

    try {
      await deleteChat({ path: { id: currentChat.id.toString() } });
      set(({ chats }) => {
        const newChats = chats.filter((chat) => chat.id !== currentChat.id);
        return {
          chats: newChats,
          currentChatSessionId: newChats.length > 0 ? newChats[0].session_id : null,
        };
      });
    } catch (error) {}
  },

  updateChat: async (chatId: number, title: string) => {
    const { getCurrentChat } = get();
    const currentChat = getCurrentChat();
    if (!currentChat) {
      return;
    }

    try {
      const { data } = await updateChat({
        path: { id: chatId.toString() },
        body: { title },
      });

      if (data) {
        // Update the chat in the local state
        set(({ chats }) => ({
          chats: chats.map((chat) => (chat.id === chatId ? { ...chat, title } : chat)),
        }));
      }
    } catch (error) {}
  },

  cancelStreaming: () => {
    const { getCurrentChat } = get();
    const currentChat = getCurrentChat();
    if (!currentChat) {
      return;
    }

    try {
      const { abortController, streamingMessageId } = get();
      if (abortController) {
        abortController.abort();
        set({ abortController: null });
      }

      // Reset state immediately
      set({ streamingMessageId: null });

      // Clear any stuck execution states from the currently streaming message
      set((state) => ({
        chats: state.chats.map((chat) =>
          chat.session_id === currentChat.session_id
            ? {
                ...chat,
                messages: chat.messages?.map((message) =>
                  message.id === streamingMessageId || message.isStreaming || message.isToolExecuting
                    ? {
                        ...message,
                        isStreaming: false,
                        isToolExecuting: false,
                        isThinkingStreaming: false,
                      }
                    : message
                ),
              }
            : chat
        ),
      }));
    } catch (error) {
      // Still reset state even if cancellation failed
      set({ streamingMessageId: null });

      const { streamingMessageId } = get();
      set((state) => ({
        chats: state.chats.map((chat) =>
          chat.session_id === currentChat.session_id
            ? {
                ...chat,
                messages: chat.messages?.map((message) =>
                  message.id === streamingMessageId || message.isStreaming || message.isToolExecuting
                    ? markChatMessageAsCancelled(message)
                    : message
                ),
              }
            : chat
        ),
      }));
    }
  },

  updateStreamingMessage: (messageId: string, content: string) => {
    const { getCurrentChat } = get();
    const currentChat = getCurrentChat();
    if (!currentChat) {
      return;
    }

    const parsed = parseThinkingContent(content);

    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.session_id === currentChat.session_id
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === messageId && message.isStreaming
                  ? {
                      ...message,
                      content: parsed.response,
                      thinkingContent: parsed.thinking,
                      isThinkingStreaming: parsed.isThinkingStreaming,
                    }
                  : message
              ),
            }
          : chat
      ),
    }));
  },

  sendChatMessage: async (message: string) => {
    const { getAllAvailableTools, selectedTools } = useMCPServersStore.getState();
    const { chat, selectedModel } = useOllamaStore.getState();
    const { isDeveloperMode, systemPrompt } = useDeveloperModeStore.getState();
    const { getCurrentChat, createNewChat } = get();
    const allAvailableTools = getAllAvailableTools();

    let currentChat = getCurrentChat();
    if (!currentChat) {
      currentChat = await createNewChat();
    }

    const currentChatSessionId = currentChat.session_id;

    if (!message.trim()) {
      return;
    }

    const modelSupportsTools = checkModelSupportsTools(selectedModel);
    const hasTools = Object.keys(allAvailableTools).length > 0;

    const aiMsgId = generateNewMessageId();
    const abortController = new AbortController();

    set((state) => ({
      streamingMessageId: aiMsgId,
      abortController,
      chats: state.chats.map((chat) =>
        chat.session_id === currentChatSessionId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                {
                  id: generateNewMessageId(),
                  created_at: generateNewMessageCreatedAt(),
                  role: 'user',
                  content: message,
                  thinking: '',
                  toolCalls: [],
                  images: [],
                  thinkingContent: '',
                  isStreaming: true,
                  isThinkingStreaming: false,
                  isToolExecuting: false,
                },
                {
                  id: aiMsgId,
                  created_at: generateNewMessageCreatedAt(),
                  role: 'assistant',
                  content: '',
                  thinking: '',
                  toolCalls: [],
                  images: [],
                  thinkingContent: '',
                  isStreaming: true,
                  isThinkingStreaming: false,
                  isToolExecuting: false,
                },
              ],
            }
          : chat
      ),
    }));

    try {
      // Add warning if tools are available but model doesn't support them
      if (hasTools && !modelSupportsTools) {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.session_id === currentChatSessionId
              ? {
                  ...chat,
                  messages: [
                    ...chat.messages,
                    {
                      id: generateNewMessageId(),
                      created_at: generateNewMessageCreatedAt(),
                      role: 'system',
                      content: `⚠️ MCP tools are available but ${selectedModel} doesn't support tool calling. Consider using functionary-small-v3.2 or another tool-enabled model.`,
                      thinking: '',
                      toolCalls: [],
                      images: [],
                      thinkingContent: '',
                      isStreaming: false,
                      isThinkingStreaming: false,
                      isToolExecuting: false,
                    },
                  ],
                }
              : chat
          ),
        }));
      }

      // Prepare chat history for Ollama SDK
      const chatHistory = currentChat.messages.filter(({ role }) => role === 'user' || role === 'assistant');
      const ollamaMessages: OllamaMessage[] = [];

      // Add system prompt if developer mode is enabled and system prompt exists
      if (isDeveloperMode && systemPrompt.trim()) {
        ollamaMessages.push({ role: 'system', content: systemPrompt.trim() });
      }

      // Add chat history
      ollamaMessages.push(
        ...chatHistory.map((message) => ({
          role: message.role,
          content: message.content,
          thinking: message.thinking,
          tool_calls: message.toolCalls as OllamaToolCall[],
          images: message.images,
        })),
        {
          role: 'user',
          content: message,
          thinking: '',
          tool_calls: [],
          images: [],
        }
      );

      let ollamaFormattedTools: OllamaTool[] = [];
      if (hasTools && modelSupportsTools) {
        // If no tools are selected, return all tools (current behavior)
        if (selectedTools.length === 0) {
          ollamaFormattedTools = convertMCPServerToolsToOllamaTools(allAvailableTools);
        } else {
          ollamaFormattedTools = convertMCPServerToolsToOllamaTools(selectedTools);
        }
      }

      const response = await chat(currentChatSessionId, ollamaMessages, ollamaFormattedTools);

      let accumulatedContent = '';
      let finalMessage: OllamaMessage | null = null;
      const accumulatedToolCalls: OllamaToolCall[] = [];

      // Stream the initial response
      for await (const part of response) {
        if (abortController.signal.aborted) {
          break;
        }

        if (part.message?.content) {
          accumulatedContent += part.message.content;
          get().updateStreamingMessage(aiMsgId, accumulatedContent);
        }

        // Collect tool calls from any streaming chunk
        if (part.message?.tool_calls) {
          accumulatedToolCalls.push(...part.message.tool_calls);
        }

        if (part.done) {
          finalMessage = part.message;
          break;
        }
      }

      // Handle tool calls if present and mark message as executing tools
      if (accumulatedToolCalls.length > 0) {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.session_id === currentChatSessionId
              ? {
                  ...chat,
                  messages: chat.messages.map((message) =>
                    message.id === aiMsgId
                      ? {
                          ...message,
                          isToolExecuting: true,
                          content: accumulatedContent,
                        }
                      : message
                  ),
                }
              : chat
          ),
        }));

        const toolResults = await executeToolsAndCollectResults(accumulatedToolCalls, ollamaMessages, finalMessage);
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.session_id === currentChatSessionId
              ? {
                  ...chat,
                  messages: chat.messages.map((message) =>
                    message.id === aiMsgId
                      ? {
                          ...message,
                          isToolExecuting: false,
                          toolCalls: toolResults,
                        }
                      : message
                  ),
                }
              : chat
          ),
        }));

        // Get final response from model after tool execution
        if (toolResults.some((tr) => tr.status === ToolCallStatus.Completed)) {
          const finalResponse = await chat(currentChatSessionId, ollamaMessages, ollamaFormattedTools);

          let finalContent = '';
          for await (const part of finalResponse) {
            if (abortController.signal.aborted) {
              break;
            }

            if (part.message?.content) {
              finalContent += part.message.content;
              get().updateStreamingMessage(aiMsgId, accumulatedContent + '\n\n' + finalContent);
            }

            if (part.done) {
              set((state) => ({
                chats: state.chats.map((chat) =>
                  chat.session_id === currentChatSessionId
                    ? {
                        ...chat,
                        messages: chat.messages.map((message) =>
                          message.id === aiMsgId
                            ? {
                                ...message,
                                content: accumulatedContent + '\n\n' + finalContent,
                                isStreaming: false,
                                isThinkingStreaming: false,
                              }
                            : message
                        ),
                      }
                    : chat
                ),
              }));
              break;
            }
          }
        }
      } else {
        // No tool calls, just finalize the message
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.session_id === currentChatSessionId
              ? {
                  ...chat,
                  messages: chat.messages.map((message) =>
                    message.id === aiMsgId
                      ? {
                          ...message,
                          isStreaming: false,
                          isThinkingStreaming: false,
                        }
                      : message
                  ),
                }
              : chat
          ),
        }));
      }

      set({ streamingMessageId: null, abortController: null });
    } catch (error: any) {
      // Handle abort specifically
      if (error.name === 'AbortError' || abortController?.signal.aborted) {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.session_id === currentChatSessionId
              ? {
                  ...chat,
                  messages: chat.messages.map((message) =>
                    message.id === aiMsgId ? markChatMessageAsCancelled(message) : message
                  ),
                }
              : chat
          ),
        }));
      } else {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.session_id === currentChatSessionId
              ? {
                  ...chat,
                  messages: chat.messages.map((message) =>
                    message.id === aiMsgId
                      ? {
                          ...message,
                          content: `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`,
                          isStreaming: false,
                          isThinkingStreaming: false,
                        }
                      : message
                  ),
                }
              : chat
          ),
        }));
      }
      set({ streamingMessageId: null, abortController: null });
    }
  },

  initializeStore: async () => {
    /**
     * Load chats on initialization, establish WebSocket connection, and listen for chat title updates
     */
    get().loadChats();

    try {
      await websocketService.connect();
      listenForChatTitleUpdates();
    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
    }
  },

  getStatus: () => {
    const { streamingMessageId } = get();
    if (streamingMessageId) {
      return ChatMessageStatus.Streaming;
    }
    return ChatMessageStatus.Ready;
  },

  setStatus: (status: ChatMessageStatus) => {
    set({ status });
  },
}));

// Initialize the chat store on mount
useChatStore.getState().initializeStore();
