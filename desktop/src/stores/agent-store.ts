import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { ToolCategory } from '../services/agent/mcp-tool-wrapper-ai-sdk';
import { AgentStateBridge } from '../services/agent/state-bridge';
import { AgentMode, AgentState, MemoryEntry, ReasoningEntry, TaskPlan, TaskProgress } from '../types/agent';
import { useChatStore } from './chat-store';

// Memory search criteria
interface MemorySearchCriteria {
  type?: string;
  query?: string;
  startDate?: Date;
  endDate?: Date;
}

// Agent store preferences
interface AgentPreferences {
  autoApproveCategories: ToolCategory[];
  autoApproveServers: string[];
}

interface AgentStoreState extends AgentState {
  reasoningMode: 'verbose' | 'concise' | 'hidden';
  isAgentActive: boolean;
  agentInstance: null;
  currentObjective: string | null;
  preferences: AgentPreferences;
  streamingMessageId: string | null;
  useV5Implementation: boolean;
  stateBridge: AgentStateBridge | null;
}

interface AgentActions {
  // Core agent control
  activateAgent: (objective: string) => Promise<void>;
  pauseAgent: () => void;
  resumeAgent: () => Promise<void>;
  stopAgent: () => void;

  // Message handling
  sendAgentMessage: (message: string) => void;

  // State updates
  setReasoningMode: (mode: 'verbose' | 'concise' | 'hidden') => void;
  updatePlan: (plan: TaskPlan) => void;
  addReasoningEntry: (entry: ReasoningEntry) => void;
  updateWorkingMemory: (entry: MemoryEntry) => void;
  setAgentMode: (mode: AgentMode) => void;
  updateProgress: (progress: Partial<TaskProgress>) => void;

  // Reasoning operations
  formatReasoningForUI: (entry: ReasoningEntry) => string;
  getFormattedReasoningHistory: (limit?: number) => Array<{ entry: ReasoningEntry; formatted: string }>;

  // Memory management
  searchAgentMemory: (criteria: MemorySearchCriteria) => MemoryEntry[];
  getMemoryContext: () => string;
  summarizeAgentMemory: () => Promise<string>;
  getMemoryStatistics: () => any;
  getRelatedMemories: (entryId: string, limit?: number) => MemoryEntry[];

  // Preferences
  updatePreferences: (updates: Partial<AgentPreferences>) => void;
  addAutoApproveCategory: (category: ToolCategory) => void;
  removeAutoApproveCategory: (category: ToolCategory) => void;
  addAutoApproveServer: (server: string) => void;
  removeAutoApproveServer: (server: string) => void;

  // Internal handlers
  handleToolExecution: (toolCall: any) => Promise<void>;
  clearAgent: () => void;
}

type AgentStore = AgentStoreState & AgentActions;

export const useAgentStore = create<AgentStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    mode: 'idle',
    currentObjective: 'Assist with user requests',
    currentAgent: undefined,
    plan: undefined,
    progress: { completed: 0, total: 0, currentStep: null },
    reasoningText: [],
    workingMemory: {
      id: crypto.randomUUID(),
      agentSessionId: crypto.randomUUID(),
      entries: [],
      created: new Date(),
      lastAccessed: new Date(),
    },
    runState: undefined,
    streamingContent: undefined,
    reasoningMode: 'verbose',
    isAgentActive: false,
    agentInstance: null,
    streamingMessageId: null,
    useV5Implementation: true, // Enable v5 by default
    stateBridge: null,
    preferences: {
      autoApproveCategories: [ToolCategory.FILE, ToolCategory.DATA] as ToolCategory[],
      autoApproveServers: [],
    },

    // Actions
    activateAgent: async (objective: string) => {
      const state = get();
      if (state.isAgentActive && state.mode !== 'idle') {
        throw new Error('Agent is already active');
      }

      // For SSE-based agent, we just set the state
      // The actual agent execution happens on the backend
      set({
        currentObjective: objective,
        mode: 'initializing',
        isAgentActive: true,
        // Clear previous agent data
        plan: undefined,
        progress: { completed: 0, total: 0, currentStep: null },
        reasoningText: [],
        streamingContent: undefined,
      });
    },

    pauseAgent: () => {
      const state = get();
      if (state.mode === 'executing') {
        set({ mode: 'paused' });
        // Pause is handled through SSE
      }
    },

    resumeAgent: async () => {
      const state = get();
      if (state.mode === 'paused') {
        set({ mode: 'executing' });
        // Resume is handled through SSE
      }
    },

    stopAgent: () => {
      set({
        mode: 'idle',
        isAgentActive: false,
        currentObjective: null,
        plan: undefined,
        progress: { completed: 0, total: 0, currentStep: null },
        reasoningText: [],
        streamingContent: undefined,
        streamingMessageId: null,
      });
    },

    sendAgentMessage: (message: string) => {
      const { isAgentActive } = get();
      if (!isAgentActive) {
        return;
      }
      // Messages are handled through SSE chat
    },

    setReasoningMode: (mode: 'verbose' | 'concise' | 'hidden') => {
      set({ reasoningMode: mode });
      // Reasoning mode is passed through SSE context
    },

    updatePlan: (plan: TaskPlan) => {
      set({ plan });
    },

    addReasoningEntry: (entry: ReasoningEntry) => {
      set((state) => ({
        reasoningText: [...state.reasoningText, entry],
      }));
    },

    updateWorkingMemory: (entry: MemoryEntry) => {
      set((state) => ({
        workingMemory: {
          ...state.workingMemory,
          entries: [...state.workingMemory.entries, entry],
          lastAccessed: new Date(),
        },
      }));
    },

    // Memory management methods
    searchAgentMemory: (criteria: MemorySearchCriteria) => {
      const { workingMemory } = get();
      // Simple in-memory search implementation
      return workingMemory.entries.filter((entry) => {
        if (criteria.type && entry.type !== criteria.type) return false;
        if (criteria.query && !entry.content.toLowerCase().includes(criteria.query.toLowerCase())) return false;
        if (criteria.startDate && entry.timestamp < criteria.startDate) return false;
        if (criteria.endDate && entry.timestamp > criteria.endDate) return false;
        return true;
      });
    },

    getMemoryContext: () => {
      const { workingMemory } = get();
      return workingMemory.entries
        .slice(-10) // Last 10 entries
        .map((e) => `[${e.type}] ${e.content}`)
        .join('\n');
    },

    summarizeAgentMemory: async () => {
      const { workingMemory } = get();
      // Simple summary implementation
      const summary = `Memory contains ${workingMemory.entries.length} entries`;
      return summary;
    },

    getMemoryStatistics: () => {
      const { workingMemory } = get();
      const stats = {
        total: workingMemory.entries.length,
        byType: {} as Record<string, number>,
      };
      workingMemory.entries.forEach((entry) => {
        stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
      });
      return stats;
    },

    getRelatedMemories: (entryId: string, limit = 5) => {
      // Simple implementation - return recent entries
      const { workingMemory } = get();
      return workingMemory.entries.filter((e) => e.id !== entryId).slice(-limit);
    },

    // Reasoning operations
    formatReasoningForUI: (entry: ReasoningEntry) => {
      const state = get();
      if (state.reasoningMode === 'hidden') return '';
      if (state.reasoningMode === 'concise') {
        return entry.content.substring(0, 100) + '...';
      }
      return entry.content;
    },

    getFormattedReasoningHistory: (limit?: number) => {
      const { reasoningText } = get();
      const entries = limit ? reasoningText.slice(-limit) : reasoningText;
      return entries.map((entry) => ({
        entry,
        formatted: get().formatReasoningForUI(entry),
      }));
    },

    setAgentMode: (mode: AgentMode) => {
      set({ mode });
    },

    updateProgress: (progress: Partial<TaskProgress>) => {
      set((state) => ({
        progress: { ...state.progress, ...progress },
      }));
    },

    // Preferences management
    updatePreferences: (updates: Partial<AgentPreferences>) => {
      set((state) => ({
        preferences: { ...state.preferences, ...updates },
      }));
    },

    addAutoApproveCategory: (category: ToolCategory) => {
      set((state) => ({
        preferences: {
          ...state.preferences,
          autoApproveCategories: state.preferences.autoApproveCategories.includes(category)
            ? state.preferences.autoApproveCategories
            : [...state.preferences.autoApproveCategories, category],
        },
      }));
    },

    removeAutoApproveCategory: (category: ToolCategory) => {
      set((state) => ({
        preferences: {
          ...state.preferences,
          autoApproveCategories: state.preferences.autoApproveCategories.filter((c) => c !== category),
        },
      }));
    },

    addAutoApproveServer: (server: string) => {
      set((state) => ({
        preferences: {
          ...state.preferences,
          autoApproveServers: state.preferences.autoApproveServers.includes(server)
            ? state.preferences.autoApproveServers
            : [...state.preferences.autoApproveServers, server],
        },
      }));
    },

    removeAutoApproveServer: (server: string) => {
      set((state) => ({
        preferences: {
          ...state.preferences,
          autoApproveServers: state.preferences.autoApproveServers.filter((s) => s !== server),
        },
      }));
    },

    handleToolExecution: async (toolCall: any) => {
      // Tool execution is handled by SSE backend
      return toolCall.result;
    },

    clearAgent: () => {
      const currentPreferences = get().preferences;
      const { stateBridge } = get();

      // Clean up state bridge
      if (stateBridge) {
        stateBridge.cleanup();
      }

      set({
        mode: 'idle',
        currentObjective: null,
        currentAgent: undefined,
        plan: undefined,
        progress: { completed: 0, total: 0, currentStep: null },
        reasoningText: [],
        workingMemory: {
          id: crypto.randomUUID(),
          agentSessionId: crypto.randomUUID(),
          entries: [],
          created: new Date(),
          lastAccessed: new Date(),
        },
        runState: undefined,
        streamingContent: undefined,
        isAgentActive: false,
        agentInstance: null,
        stateBridge: null,
        // Preserve preferences across sessions
        preferences: currentPreferences,
      });
    },
  }))
);

// Store initialization and cleanup
let cleanupAgentStore: (() => void) | null = null;

function initializeAgentStore() {
  // Prevent multiple initializations
  if (cleanupAgentStore) {
    return cleanupAgentStore;
  }

  // Track previous chat history length to detect new messages
  let previousChatLength = 0;
  let isProcessingMessage = false;

  // Remove duplicate agent initialization - agent should only be created in activateAgent
  // This was causing duplicate agent instances and secondary Ollama calls

  // Defer subscription to avoid initialization issues
  const timeoutId = setTimeout(() => {
    const unsubscribe = useChatStore.subscribe((state) => {
      const chatHistory = state.chatHistory;

      // Only process if chat history actually changed and we're not already processing
      if (chatHistory.length === previousChatLength || isProcessingMessage) {
        return;
      }

      const agentState = useAgentStore.getState();

      // Check if a new message was added
      if (agentState.isAgentActive && chatHistory.length > previousChatLength) {
        const lastMessage = chatHistory[chatHistory.length - 1];
        if (lastMessage.role === 'user' && !lastMessage.toolCalls && !(lastMessage as any).isFromAgent) {
          // Set flag to prevent infinite loop
          isProcessingMessage = true;

          // User messages during agent execution are handled through SSE

          // Reset flag after a small delay
          setTimeout(() => {
            isProcessingMessage = false;
          }, 100);
        }
      }

      previousChatLength = chatHistory.length;
    });

    // Store the unsubscribe function
    cleanupAgentStore = () => {
      unsubscribe();
    };
  }, 0);

  // Cleanup on window unload
  const handleUnload = () => {
    if (cleanupAgentStore) {
      cleanupAgentStore();
    }
  };

  window.addEventListener('beforeunload', handleUnload);

  // Return cleanup function
  return () => {
    clearTimeout(timeoutId);
    if (cleanupAgentStore) {
      cleanupAgentStore();
    }
    window.removeEventListener('beforeunload', handleUnload);
  };
}

// Initialize the store lazily
if (typeof window !== 'undefined') {
  initializeAgentStore();
}

// Export cleanup function for testing
export { cleanupAgentStore };
