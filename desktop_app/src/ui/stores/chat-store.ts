import { create } from 'zustand';

import config from '@ui/config';
import { createChat, deleteChat, getChatById, getChats, updateChat } from '@ui/lib/clients/archestra/api/gen';
import { initializeChat } from '@ui/lib/utils/chat';
import websocketService from '@ui/lib/websocket';
import { type ChatWithMessages } from '@ui/types';

interface ChatState {
  chats: ChatWithMessages[];
  currentChatSessionId: string | null;
  isLoadingChats: boolean;
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
}

type ChatStore = ChatState & ChatActions;

/**
 * Listen for chat title updates from the backend via WebSocket
 */
const listenForChatTitleUpdates = () => {
  return websocketService.subscribe('chat-title-updated', (message) => {
    const { chatId, title } = message.payload;
    useChatStore.setState((state) => ({
      chats: state.chats.map((chat) => (chat.id === chatId ? { ...chat, title } : chat)),
    }));
  });
};

export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  chats: [],
  currentChatSessionId: null,
  isLoadingChats: false,

  // Actions
  loadChats: async () => {
    set({ isLoadingChats: true });
    try {
      const { data } = await getChats();
      if (data.length > 0) {
        const initializedChats = data.map(initializeChat);
        set({
          chats: initializedChats,
          currentChatSessionId: initializedChats.length > 0 ? initializedChats[0].sessionId : null,
        });
      } else {
        /**
         * No chats found, create a new one.. there should never be a case where no chat exists..
         */
        await get().createNewChat();
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      set({ isLoadingChats: false });
    }
  },

  createNewChat: async () => {
    try {
      const { data } = await createChat({
        body: {
          llm_provider: 'ollama',
        },
      });

      // The API client returns { data: ... } wrapper
      if (!data) {
        throw new Error('No data returned from create chat API');
      }

      const initializedChat = initializeChat(data);

      set((state) => ({
        chats: [initializedChat, ...state.chats],
        currentChatSessionId: initializedChat.sessionId,
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
          chats: state.chats.map((chat) => (chat.id === chatId ? initializedChat : chat)),
          currentChatSessionId: initializedChat.sessionId,
        }));
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error);
      // Fall back to just switching without loading messages
      const chat = get().chats.find((c) => c.id === chatId);
      if (chat) {
        set({ currentChatSessionId: chat.sessionId });
      }
    }
  },

  getCurrentChat: () => {
    const { currentChatSessionId, chats } = get();
    return chats.find((chat) => chat.sessionId === currentChatSessionId) || null;
  },

  getCurrentChatTitle: () => {
    const currentChat = get().getCurrentChat();
    return currentChat?.title || config.chat.defaultTitle;
  },

  deleteCurrentChat: async () => {
    const currentChat = get().getCurrentChat();
    if (!currentChat) return;

    try {
      await deleteChat({ path: { id: currentChat.id.toString() } });

      const { chats } = get();
      const newChats = chats.filter((chat) => chat.id !== currentChat.id);

      if (newChats.length === 0) {
        /**
         * Remove the deleted chat from the state and then create a new one
         *
         * there should never be a case where no chat exists..
         */
        set({ chats: [], currentChatSessionId: null });

        await get().createNewChat();
      } else {
        set({ chats: newChats, currentChatSessionId: newChats[0].sessionId });
      }
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
      listenForChatTitleUpdates();
    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
    }
  },
}));

// Initialize the chat store on mount
useChatStore.getState().initializeStore();
