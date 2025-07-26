import { listen } from '@tauri-apps/api/event';
import { Message as OllamaMessage, Tool as OllamaTool, ToolCall as OllamaToolCall } from 'ollama/browser';
import { create } from 'zustand';

import { createChat, deleteChat, getAllChats, updateChat } from '@/lib/api';
import {
  checkModelSupportsTools,
  initializeChat,
  markChatInteractionAsCancelled,
  parseThinkingContent,
} from '@/lib/utils/chat';
import { convertMCPServerToolsToOllamaTools, convertOllamaToolNameToServerAndToolName } from '@/lib/utils/ollama';
import type { ChatTitleUpdatedEvent, ChatWithInteractions, ToolCallInfo, ToolWithMCPServerName } from '@/types';

import { useDeveloperModeStore } from './developer-mode-store';
import { useMCPServersStore } from './mcp-servers-store';
import { useOllamaStore } from './ollama-store';

interface ChatState {
  chats: ChatWithInteractions[];
  currentChat: ChatWithInteractions | null;
  streamingMessageId: string | null;
  abortController: AbortController | null;
  isLoadingChats: boolean;
  isLoadingMessages: boolean;
}

interface ChatActions {
  loadChats: () => Promise<void>;
  createNewChat: () => Promise<void>;
  selectChat: (chatId: number) => void;
  getCurrentChatTitle: () => string;
  deleteCurrentChat: () => Promise<void>;
  updateChat: (chatId: number, title: string | null) => Promise<void>;
  sendChatMessage: (message: string, selectedTools?: ToolWithMCPServerName[]) => Promise<void>;
  cancelStreaming: () => void;
  updateStreamingMessage: (messageId: string, content: string) => void;
  _listenForChatTitleUpdates: () => void;
  initializeStore: () => void;
}

type ChatStore = ChatState & ChatActions;

const executeToolsAndCollectResults = async (
  toolCalls: OllamaToolCall[],
  ollamaMessages: OllamaMessage[],
  finalMessage: OllamaMessage | null
): Promise<ToolCallInfo[]> => {
  const { executeTool } = useMCPServersStore.getState();

  const toolResults: ToolCallInfo[] = [];
  for (const toolCall of toolCalls) {
    const functionName = toolCall.function.name;
    const args = toolCall.function.arguments;
    const [serverName, toolName] = convertOllamaToolNameToServerAndToolName(functionName);

    try {
      const result = await executeTool(serverName, {
        name: toolName,
        arguments: args,
      });
      const toolResultContent = typeof result === 'string' ? result : JSON.stringify(result);

      toolResults.push({
        id: functionName,
        serverName,
        toolName,
        arguments: args,
        result: toolResultContent,
        status: 'completed',
        executionTime: 0,
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
        id: functionName,
        serverName,
        toolName,
        arguments: toolCall.function.arguments,
        result: '',
        error: error instanceof Error ? error.message : String(error),
        status: 'error',
        executionTime: 0,
        startTime: new Date(),
        endTime: new Date(),
      });
    }
  }

  return toolResults;
};

export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  chats: [],
  currentChat: null,
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
          currentChat: initializedChats[0],
          isLoadingChats: false,
        });
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
      set({ isLoadingChats: false });
    }
  },

  createNewChat: async () => {
    const { selectedModel } = useOllamaStore.getState();
    try {
      const { data } = await createChat({
        body: {
          llm_provider: 'ollama',
          llm_model: selectedModel,
        },
      });
      if (data) {
        const initializedChat = initializeChat(data);

        set((state) => ({
          chats: [initializedChat, ...state.chats],
          currentChat: initializedChat,
        }));
      }
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  },

  selectChat: (chatId: number) => {
    set({
      currentChat: get().chats.find((chat) => chat.chat.id === chatId) || null,
    });
  },

  getCurrentChatTitle: () => {
    const { currentChat } = get();
    return currentChat?.chat.title || 'New Chat';
  },

  deleteCurrentChat: async () => {
    const { currentChat } = get();
    if (!currentChat) {
      return;
    }

    try {
      await deleteChat({ path: { id: currentChat.chat.id.toString() } });
      set((state) => {
        const newChats = state.chats.filter((chat) => chat.chat.id !== currentChat.chat.id);
        const newCurrentChat = newChats.length > 0 ? newChats[0] : null;
        return {
          chats: newChats,
          currentChat: newCurrentChat,
        };
      });
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  },

  updateChat: async (chatId: number, title: string | null) => {
    try {
      const { data } = await updateChat({
        path: { id: chatId.toString() },
        body: { title },
      });

      if (data) {
        // Update the chat in the local state
        set(({ currentChat, chats }) => ({
          currentChat: currentChat?.chat.id === chatId ? { ...currentChat, title } : currentChat,
          chats: chats.map((chat) => (chat.chat.id === chatId ? { ...chat, title } : chat)),
        }));
      }
    } catch (error) {
      console.error('Failed to update chat:', error);
      throw error; // Re-throw to let the UI handle the error
    }
  },

  cancelStreaming: () => {
    const { currentChat } = get();
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
      set({
        currentChat: {
          ...currentChat,
          interactions: currentChat?.interactions.map((interaction) =>
            interaction.id === streamingMessageId || interaction.isStreaming || interaction.isToolExecuting
              ? {
                  ...interaction,
                  isStreaming: false,
                  isToolExecuting: false,
                  isThinkingStreaming: false,
                }
              : interaction
          ),
        },
      });
    } catch (error) {
      // Still reset state even if cancellation failed
      set({ streamingMessageId: null });

      const { streamingMessageId } = get();
      set({
        currentChat: {
          ...currentChat,
          interactions: currentChat?.interactions.map((interaction) =>
            interaction.id === streamingMessageId || interaction.isStreaming || interaction.isToolExecuting
              ? markChatInteractionAsCancelled(interaction)
              : interaction
          ),
        },
      });
    }
  },

  updateStreamingMessage: (messageId: string, content: string) => {
    const { currentChat } = get();
    if (!currentChat) {
      return;
    }

    const parsed = parseThinkingContent(content);
    set({
      currentChat: {
        ...currentChat,
        interactions: currentChat?.interactions.map((interaction) =>
          interaction.id === messageId && interaction.isStreaming
            ? {
                ...interaction,
                content: parsed.response,
                thinkingContent: parsed.thinking,
                isThinkingStreaming: parsed.isThinkingStreaming,
              }
            : interaction
        ),
      },
    });
  },

  sendChatMessage: async (message: string) => {
    const { allTools, selectedTools } = useMCPServersStore.getState();
    const { chat, selectedModel } = useOllamaStore.getState();
    const { isDeveloperMode, systemPrompt } = useDeveloperModeStore.getState();
    const { currentChat } = get();

    if (!currentChat) {
      return;
    }

    const currentChatSessionId = currentChat.chat.session_id;

    if (!message.trim()) {
      return;
    }

    const modelSupportsTools = checkModelSupportsTools(selectedModel);
    const hasTools = Object.keys(allTools).length > 0;
    const aiMsgId = (Date.now() + 1).toString();
    const abortController = new AbortController();

    set({
      streamingMessageId: aiMsgId,
      abortController,
      currentChat: {
        ...currentChat,
        interactions: [
          ...currentChat.interactions,
          {
            id: Date.now().toString(),
            role: 'user',
            content: message,
            timestamp: new Date(),
          } as any, // TODO:
          {
            id: aiMsgId,
            role: 'assistant',
            content: '',
            thinkingContent: '',
            timestamp: new Date(),
            isStreaming: true,
            isThinkingStreaming: false,
          } as any, // TODO:
        ],
      },
    });

    try {
      // Add warning if tools are available but model doesn't support them
      if (hasTools && !modelSupportsTools) {
        set({
          currentChat: {
            ...currentChat,
            interactions: [
              ...currentChat.interactions,
              {
                id: (Date.now() + Math.random()).toString(),
                role: 'system',
                content: `⚠️ MCP tools are available but ${selectedModel} doesn't support tool calling. Consider using functionary-small-v3.2 or another tool-enabled model.`,
                timestamp: new Date(),
              } as any, // TODO:
            ],
          },
        });
      }

      // Prepare chat history for Ollama SDK
      // TODO: typing
      const chatHistory = currentChat.interactions.filter(
        (interaction: any) => interaction.role === 'user' || interaction.role === 'assistant'
      );
      const ollamaMessages: OllamaMessage[] = [];

      // Add system prompt if developer mode is enabled and system prompt exists
      if (isDeveloperMode && systemPrompt.trim()) {
        ollamaMessages.push({ role: 'system', content: systemPrompt.trim() });
      }

      // Add chat history
      ollamaMessages.push(
        // TODO: typing
        ...chatHistory.map((interaction: any) => ({
          role: interaction.role as 'user' | 'assistant',
          content: interaction.content,
        })),
        { role: 'user', content: message }
      );

      let ollamaFormattedTools: OllamaTool[] = [];
      if (hasTools && modelSupportsTools) {
        // If no tools are selected, return all tools (current behavior)
        if (selectedTools.length === 0) {
          ollamaFormattedTools = convertMCPServerToolsToOllamaTools(allTools);
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
        set({
          currentChat: {
            ...currentChat,
            // TODO: typing
            interactions: currentChat?.interactions.map((interaction: any) =>
              interaction.id === aiMsgId
                ? {
                    ...interaction,
                    isToolExecuting: true,
                    content: accumulatedContent,
                  }
                : interaction
            ),
          },
        });

        const toolResults = await executeToolsAndCollectResults(accumulatedToolCalls, ollamaMessages, finalMessage);
        set({
          currentChat: {
            ...currentChat,
            // TODO: typing
            interactions: currentChat?.interactions.map((interaction: any) =>
              interaction.id === aiMsgId
                ? {
                    ...interaction,
                    isToolExecuting: false,
                    toolCalls: toolResults,
                  }
                : interaction
            ),
          },
        });

        // Get final response from model after tool execution
        if (toolResults.some((tr) => tr.status === 'completed')) {
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
              set({
                currentChat: {
                  ...currentChat,
                  // TODO: typing
                  interactions: currentChat?.interactions.map((interaction: any) =>
                    interaction.id === aiMsgId
                      ? {
                          ...interaction,
                          content: accumulatedContent + '\n\n' + finalContent,
                          isStreaming: false,
                          isThinkingStreaming: false,
                        }
                      : interaction
                  ),
                },
              });
              break;
            }
          }
        }
      } else {
        // No tool calls, just finalize the message
        set({
          currentChat: {
            ...currentChat,
            // TODO: typing
            interactions: currentChat?.interactions.map((interaction: any) =>
              interaction.id === aiMsgId
                ? {
                    ...interaction,
                    isStreaming: false,
                    isThinkingStreaming: false,
                  }
                : interaction
            ),
          },
        });
      }

      set({ streamingMessageId: null, abortController: null });
    } catch (error: any) {
      // Handle abort specifically
      if (error.name === 'AbortError' || abortController?.signal.aborted) {
        set({
          currentChat: {
            ...currentChat,
            // TODO: typing
            interactions: currentChat?.interactions.map((interaction: any) =>
              interaction.id === aiMsgId ? markChatInteractionAsCancelled(interaction) : interaction
            ),
          },
        });
      } else {
        set({
          currentChat: {
            ...currentChat,
            // TODO: typing
            interactions: currentChat?.interactions.map((interaction: any) =>
              interaction.id === aiMsgId
                ? {
                    ...interaction,
                    content: `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`,
                    isStreaming: false,
                    isThinkingStreaming: false,
                  }
                : interaction
            ),
          },
        });
      }
      set({ streamingMessageId: null, abortController: null });
    }
  },

  _listenForChatTitleUpdates: () => {
    /**
     * Listen for chat title updates from the backend
     */
    listen<ChatTitleUpdatedEvent>('chat-title-updated', ({ payload: { chat_id, title } }) => {
      set(({ chats, currentChat }) => {
        const updatedChatIsCurrentChat = currentChat?.chat.id === chat_id;
        const newCurrentChat = updatedChatIsCurrentChat
          ? { ...currentChat, chat: { ...currentChat.chat, title } }
          : currentChat;

        return {
          chats: chats.map((chat) => (chat.chat.id === chat_id ? { ...chat, chat: { ...chat.chat, title } } : chat)),
          currentChat: newCurrentChat,
        };
      });
    });
  },

  initializeStore: () => {
    /**
     * Load chats on initialization and listen for chat title updates
     */
    get().loadChats();
    get()._listenForChatTitleUpdates();
  },
}));

// Initialize the chat store on mount
useChatStore.getState().initializeStore();

// Computed selectors
export const useIsStreaming = () => useChatStore((state) => state.streamingMessageId !== null);
