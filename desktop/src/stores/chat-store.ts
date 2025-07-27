import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';

import { DEFAULT_CHAT_TITLE } from '@/consts';
import {
  ChatWithInteractions as ServerChatWithInteractions,
  createChat,
  deleteChat,
  getAllChats,
  updateChat,
} from '@/lib/api-client';
import { initializeChat } from '@/lib/utils/chat';
import { ChatInteractionStatus, type ChatTitleUpdatedEvent, type ChatWithInteractions } from '@/types';

interface ChatState {
  status: ChatInteractionStatus;
  chats: ChatWithInteractions[];
  currentChatSessionId: string | null;
  isLoadingChats: boolean;
}

interface ChatActions {
  getStatus: () => ChatInteractionStatus;
  setStatus: (status: ChatInteractionStatus) => void;
  loadChats: () => Promise<void>;
  createNewChat: () => Promise<ChatWithInteractions>;
  selectChat: (chatId: number) => void;
  getCurrentChat: () => ChatWithInteractions | null;
  getCurrentChatTitle: () => string;
  deleteCurrentChat: () => Promise<void>;
  updateChat: (chatId: number, title: string) => Promise<void>;
  initializeStore: () => void;
}

type ChatStore = ChatState & ChatActions;

/**
 * Listen for chat title updates from the backend
 */
const listenForChatTitleUpdates = () => {
  listen<ChatTitleUpdatedEvent>('chat-title-updated', ({ payload: { chat_id, title } }) => {
    useChatStore.setState((state) => ({
      chats: state.chats.map((chat) => (chat.id === chat_id ? { ...chat, title } : chat)),
    }));
  });
};

export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  status: ChatInteractionStatus.Ready,
  chats: [],
  currentChatSessionId: null,
  isLoadingChats: false,

  // Actions
  getStatus: () => get().status,

  setStatus: (status) => set({ status }),

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
      console.error('Failed to load chats:', error);
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
      const initializedChat = initializeChat(response.data as ServerChatWithInteractions);

      set((state) => ({
        chats: [initializedChat, ...state.chats],
        currentChatSessionId: initializedChat.session_id,
      }));

      return initializedChat;
    } catch (error) {
      console.error('Failed to create chat:', error);
      throw error;
    }
  },

  selectChat: (chatId: number) => {
    const chat = get().chats.find((chat) => chat.id === chatId);
    if (chat) {
      set({ currentChatSessionId: chat.session_id });
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
      // Stop any active streaming before deleting
      if (window.__CHAT_STOP_STREAMING__) {
        console.log('[ChatStore] Stopping active streaming before chat deletion');
        window.__CHAT_STOP_STREAMING__();
      }

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

  updateChat: async (chatId: number, title: string) => {
    try {
      const { data } = await updateChat({
        path: { id: chatId.toString() },
        body: { title },
      });

      if (data) {
        set((state) => ({
          chats: state.chats.map((chat) => (chat.id === chatId ? { ...chat, title } : chat)),
        }));
      }
    } catch (error) {
      console.error('Failed to update chat:', error);
    }
  },

  initializeStore: () => {
    // Listen for chat title updates from the backend
    listenForChatTitleUpdates();
  },
}));

// Initialize the chat store on mount
useChatStore.getState().initializeStore();
