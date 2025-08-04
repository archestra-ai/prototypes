import { create } from 'zustand';

import {
  ChatWithMessages as ServerChatWithMessages,
  deleteChatApiChatById,
  getChatApiChat,
  getChatApiChatById,
  patchChatApiChatById,
  postChatApiChat,
} from '@clients/archestra/api/gen';
import config from '@config';
import { type ChatWithMessages } from '@types';
import { getDefaultModel } from '@ui/hooks/use-ai-chat-backend';
import { initializeChat } from '@ui/lib/utils/chat';
import { websocketService } from '@ui/lib/websocket';

interface ChatState {
  chats: ChatWithMessages[];
  currentChatSessionId: string | null;
  isLoadingChats: boolean;
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
  selectedAIModel: getDefaultModel('ollama'),

  // Actions
  loadChats: async () => {
    set({ isLoadingChats: true });
    try {
      const { data } = await getChatApiChat();
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
      const response = await postChatApiChat({
        body: {
          llm_provider: 'ollama',
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
      const { data } = await getChatApiChatById({ path: { id: chatId.toString() } });

      if (data) {
        const initializedChat = initializeChat(data);

        // Update the chat in the store with the fetched data
        set((state) => ({
          chats: state.chats.map((chat) => (chat.id === chatId ? initializedChat : chat)),
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
    return currentChat?.title || config.ui.chat.defaultTitle;
  },

  deleteCurrentChat: async () => {
    const currentChat = get().getCurrentChat();
    if (!currentChat) return;

    try {
      await deleteChatApiChatById({ path: { id: currentChat.id.toString() } });
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
      await patchChatApiChatById({
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

  setSelectedAIModel: (model: string) => {
    set({ selectedAIModel: model });
  },
}));

// Initialize the chat store on mount
useChatStore.getState().initializeStore();
