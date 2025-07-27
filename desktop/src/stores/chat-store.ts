import { create } from 'zustand';

import { apiClient } from '@/lib/api-client';
import { createChat, deleteChat, getAllChats, updateChat } from '@/lib/api/sdk.gen';
import type { ChatWithInteractions } from '@/lib/api/types.gen';

interface ChatStore {
  chats: ChatWithInteractions[];
  currentChat: ChatWithInteractions;
  isLoadingChats: boolean;
  selectChat: (chatId: number) => Promise<void>;
  createNewChat: () => Promise<void>;
  deleteCurrentChat: () => Promise<void>;
  updateChat: (chatId: number, title: string) => Promise<void>;
  getCurrentChatTitle: () => string;
  fetchChats: () => Promise<void>;
}

// Default empty chat
const defaultChat: ChatWithInteractions = {
  id: 0,
  session_id: '',
  title: null,
  llm_provider: 'ollama',
  created_at: new Date().toISOString(),
  interactions: [],
};

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  currentChat: defaultChat,
  isLoadingChats: false,

  fetchChats: async () => {
    set({ isLoadingChats: true });
    try {
      const response = await getAllChats({ client: apiClient });
      if (response.data) {
        set({ chats: response.data });
        // Select first chat if available
        if (response.data.length > 0 && get().currentChat.id === 0) {
          set({ currentChat: response.data[0] });
        }
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      set({ isLoadingChats: false });
    }
  },

  selectChat: async (chatId: number) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (chat) {
      set({ currentChat: chat });
    }
  },

  createNewChat: async () => {
    try {
      const response = await createChat({
        client: apiClient,
        body: { llm_provider: 'ollama' },
      });
      if (response.data) {
        set((state) => ({
          chats: [response.data, ...state.chats],
          currentChat: response.data,
        }));
      }
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  },

  deleteCurrentChat: async () => {
    const { currentChat, chats } = get();
    if (currentChat.id === 0) return;

    try {
      await deleteChat({
        client: apiClient,
        path: { id: currentChat.id.toString() },
      });
      const newChats = chats.filter((c) => c.id !== currentChat.id);
      set({
        chats: newChats,
        currentChat: newChats.length > 0 ? newChats[0] : defaultChat,
      });
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  },

  updateChat: async (chatId: number, title: string) => {
    try {
      const response = await updateChat({
        client: apiClient,
        path: { id: chatId.toString() },
        body: { title },
      });
      if (response.data) {
        set((state) => ({
          chats: state.chats.map((c) => (c.id === chatId ? response.data : c)),
          currentChat: state.currentChat.id === chatId ? response.data : state.currentChat,
        }));
      }
    } catch (error) {
      console.error('Failed to update chat:', error);
    }
  },

  getCurrentChatTitle: () => {
    const { currentChat } = get();
    return currentChat.title || 'New Chat';
  },
}));
