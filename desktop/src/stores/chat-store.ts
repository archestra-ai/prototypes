import { create } from 'zustand';

import { DEFAULT_CHAT_TITLE } from '@/consts';
import {
  ChatWithMessages as ServerChatWithMessages,
  createChat,
  deleteChat,
  getAllChats,
  updateChat,
} from '@/lib/api-client';
import { initializeChat } from '@/lib/utils/chat';
import { websocketService } from '@/lib/websocket';
import { ChatMessageStatus, type ChatWithMessages } from '@/types';

interface ChatState {
  status: ChatMessageStatus;
  chats: ChatWithMessages[];
  currentChatSessionId: string | null;
  isLoadingChats: boolean;
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
  initializeStore: () => void;
}

type ChatStore = ChatState & ChatActions;

/**
 * Listen for chat title updates from the backend via WebSocket
 */
const listenForChatTitleUpdates = () => {
  // Listen for chat title updates from the backend via WebSocket
  websocketService.subscribe('chat-title-updated', (message) => {
    const { chat_id, title } = message.payload;
    useChatStore.setState((state) => ({
      chats: state.chats.map((chat) => (chat.id === chat_id ? { ...chat, title } : chat)),
    }));
  });
};

export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  status: ChatMessageStatus.Ready,
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
        const initializedChats = data.map((chat) => initializeChat(chat as unknown as ServerChatWithMessages));

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
      const initializedChat = initializeChat(response.data as unknown as ServerChatWithMessages);

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
    // Connect to WebSocket and listen for chat title updates
    websocketService
      .connect()
      .then(() => {
        console.log('WebSocket connected, listening for chat title updates');
        listenForChatTitleUpdates();
      })
      .catch((error) => {
        console.error('Failed to connect to WebSocket:', error);
      });
  },
}));

// Initialize the chat store on mount
useChatStore.getState().initializeStore();
