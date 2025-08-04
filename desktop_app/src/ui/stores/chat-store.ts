import { create } from 'zustand';

import { DEFAULT_CHAT_TITLE } from '@ui/consts';
import { getDefaultModel } from '@ui/hooks/use-ai-chat-backend';
import {
  ChatWithMessages as ServerChatWithMessages,
  createChat,
  deleteChat,
  getAllChats,
  getChatById,
  updateChat,
} from '@ui/lib/api-client';
import { initializeChat } from '@ui/lib/utils/chat';
import { websocketService } from '@ui/lib/websocket';
import { type ChatWithMessages } from '@ui/types';

export type LLMProvider = 'ollama' | 'chatgpt' | 'claude';

interface ChatState {
  chats: ChatWithMessages[];
  currentChatSessionId: string | null;
  isLoadingChats: boolean;
  selectedProvider: LLMProvider;
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  selectedAIModel: string | null;
}

interface ChatActions {
  // Chat operations
  loadChats: () => Promise<void>;
  createNewChat: () => Promise<ChatWithMessages>;
  selectChat: (chatId: number) => Promise<void>;
  getCurrentChat: () => ChatWithMessages | null;
  getCurrentChatTitle: () => string;
  deleteCurrentChat: () => Promise<void>;
  updateChatTitle: (chatId: number, title: string) => Promise<void>;
  initializeStore: () => Promise<void>;
  // Provider operations
  setSelectedProvider: (provider: LLMProvider) => void;
  setOpenAIApiKey: (apiKey: string) => void;
  setAnthropicApiKey: (apiKey: string) => void;
  setSelectedAIModel: (model: string) => void;
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

export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  chats: [],
  currentChatSessionId: null,
  isLoadingChats: false,
  selectedProvider: 'ollama',
  openaiApiKey: null,
  anthropicApiKey: null,
  selectedAIModel: getDefaultModel('ollama'),

  // Actions
  loadChats: async () => {
    set({ isLoadingChats: true });
    try {
      const { data } = await getAllChats();
      console.log('Initializing chats...');
      console.log(data);
      if (data) {
        const initializedChats = data.map(initializeChat);
        set({
          chats: initializedChats,
          currentChatSessionId: initializedChats.length > 0 ? initializedChats[0].session_id : null,
          isLoadingChats: false,
        });
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
      set({ isLoadingChats: false });
    }
  },

  createNewChat: async () => {
    try {
      const { selectedProvider } = get();
      const response = await createChat({
        body: {
          llm_provider:
            selectedProvider === 'chatgpt' ? 'openai' : selectedProvider === 'claude' ? 'anthropic' : 'ollama',
        },
      });

      // The API client returns { data: ... } wrapper
      if (!response.data) {
        throw new Error('No data returned from create chat API');
      }

      const initializedChat = initializeChat(response.data as ServerChatWithMessages);

      set((state) => ({
        chats: [initializedChat, ...state.chats],
        currentChatSessionId: initializedChat.session_id,
      }));

      return initializedChat;
    } catch (error) {
      console.error('Failed to create new chat:', error);
      throw error;
    }
  },

  selectChat: async (chatId: number) => {
    try {
      // Fetch the chat with its messages from the API
      const { data } = await getChatById({ path: { id: chatId.toString() } });
      
      if (data) {
        const initializedChat = initializeChat(data);
        
        // Update the chat in the store with the fetched data
        set((state) => ({
          chats: state.chats.map((chat) => 
            chat.id === chatId ? initializedChat : chat
          ),
          currentChatSessionId: initializedChat.session_id,
        }));
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error);
      // Fall back to just switching without loading messages
      const chat = get().chats.find((c) => c.id === chatId);
      if (chat) {
        set({ currentChatSessionId: chat.session_id });
      }
    }
  },

  getCurrentChat: () => {
    const { currentChatSessionId, chats } = get();
    return chats.find((chat) => chat.session_id === currentChatSessionId) || null;
  },

  getCurrentChatTitle: () => {
    const currentChat = get().getCurrentChat();
    return currentChat?.title || DEFAULT_CHAT_TITLE;
  },

  deleteCurrentChat: async () => {
    const currentChat = get().getCurrentChat();
    if (!currentChat) return;

    try {
      await deleteChat({ path: { id: currentChat.id.toString() } });
      set((state) => {
        const newChats = state.chats.filter((chat) => chat.id !== currentChat.id);
        return {
          chats: newChats,
          currentChatSessionId: newChats.length > 0 ? newChats[0].session_id : null,
        };
      });
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  },

  updateChatTitle: async (chatId: number, title: string) => {
    try {
      await updateChat({
        path: { id: chatId.toString() },
        body: { title },
      });

      set((state) => ({
        chats: state.chats.map((chat) => (chat.id === chatId ? { ...chat, title } : chat)),
      }));
    } catch (error) {
      console.error('Failed to update chat title:', error);
    }
  },

  initializeStore: async () => {
    get().loadChats();

    try {
      await websocketService.connect();
      listenForChatTitleUpdates();
    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
    }
  },

  // Provider operations
  setSelectedProvider: (provider: LLMProvider) => {
    // Map provider to AI provider key
    const providerMap = {
      chatgpt: 'openai',
      claude: 'anthropic',
      ollama: 'ollama',
    } as const;

    const aiProviderKey = providerMap[provider];
    const defaultModel = getDefaultModel(aiProviderKey);

    set({
      selectedProvider: provider,
      selectedAIModel: defaultModel,
    });
  },

  setOpenAIApiKey: (apiKey: string) => {
    set({ openaiApiKey: apiKey });
  },

  setAnthropicApiKey: (apiKey: string) => {
    set({ anthropicApiKey: apiKey });
  },

  setSelectedAIModel: (model: string) => {
    set({ selectedAIModel: model });
  },
}));

// Initialize the chat store on mount
useChatStore.getState().initializeStore();
