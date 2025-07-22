import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { ArchestraAgent, MemorySearchCriteria } from '../services/agent';
import { AgentEventCallbacks, AgentEventHandler } from '../services/agent/agent-event-handler';
import { HumanInLoopHandler } from '../services/agent/human-in-loop';
import { ToolCategory, extractToolsFromServers as extractMCPTools } from '../services/agent/mcp-tool-wrapper';
import {
  AgentMode,
  AgentState,
  ArchestraAgentConfig,
  MemoryEntry,
  ReasoningEntry,
  TaskPlan,
  TaskProgress,
} from '../types/agent';
import { useChatStore } from './chat-store';
import { useMCPServersStore } from './mcp-servers-store';
import { useOllamaStore } from './ollama-store';

// Create event handler callbacks for the agent store
function createAgentEventCallbacks(
  setState: (updates: Partial<AgentStoreState> | ((state: AgentStoreState) => Partial<AgentStoreState>)) => void,
  handleToolExecution: (tool: any) => Promise<void>
): AgentEventCallbacks {
  return {
    onStateChange: (state: Partial<AgentState>) => setState(state),

    onToolExecution: handleToolExecution,

    onMessage: (message: string) => {
      const { sendChatMessage } = useChatStore.getState();
      const { selectedModel } = useOllamaStore.getState();
      sendChatMessage(message, selectedModel || 'gpt-4o');
    },

    onReasoningUpdate: (entry: ReasoningEntry) => {
      setState((state: AgentStoreState) => ({
        reasoning: [...state.reasoning, entry],
      }));
    },

    onProgressUpdate: (progress: Partial<TaskProgress>) => {
      setState((state: AgentStoreState) => ({
        progress: { ...state.progress, ...progress },
      }));
    },

    onMemoryUpdate: (entry: MemoryEntry) => {
      setState((state: AgentStoreState) => ({
        workingMemory: {
          ...state.workingMemory,
          entries: [...state.workingMemory.entries, entry],
          lastAccessed: new Date(),
        },
      }));
    },

    onError: (error: any) => {
      console.error('Agent execution error:', error);
      setState({ mode: 'idle', isAgentActive: false });
    },
  };
}

// Agent store preferences
interface AgentPreferences {
  autoApproveCategories: ToolCategory[];
  autoApproveServers: string[];
}

interface AgentStoreState extends AgentState {
  reasoningMode: 'verbose' | 'concise' | 'hidden';
  isAgentActive: boolean;
  agentInstance: ArchestraAgent | null;
  currentObjective: string | null;
  preferences: AgentPreferences;
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
    currentObjective: null,
    currentAgent: undefined,
    plan: undefined,
    progress: { completed: 0, total: 0, currentStep: null },
    reasoning: [],
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
    preferences: {
      autoApproveCategories: ['read', 'search'] as ToolCategory[],
      autoApproveServers: [],
    },

    // Actions
    activateAgent: async (objective: string) => {
      const state = get();
      if (state.isAgentActive && state.mode !== 'idle') {
        throw new Error('Agent is already active');
      }

      const { installedMCPServers, archestraMCPServer } = useMCPServersStore.getState();
      const { selectedModel } = useOllamaStore.getState();

      set({
        currentObjective: objective,
        mode: 'initializing',
        isAgentActive: true,
      });

      // Extract MCP tools with auto-approval preferences
      const allServers = [...installedMCPServers];
      if (archestraMCPServer.status === 'connected') {
        allServers.push(archestraMCPServer);
      }

      const mcpTools = extractMCPTools(allServers, {
        autoApproveCategories: state.preferences.autoApproveCategories,
        autoApproveServers: state.preferences.autoApproveServers,
        customApprovalCheck: async (serverName, toolName, args) => {
          // Get the human-in-the-loop handler from window (set by ToolApprovalQueue)
          const handler = (window as any).__toolApprovalHandler as HumanInLoopHandler;
          if (!handler) {
            // If no handler available, check if tool requires approval
            return !state.preferences.autoApproveServers.includes(serverName);
          }

          // Use handler to check if approval is required
          const requiresApproval = await handler.requiresApproval(toolName, serverName, args);

          if (requiresApproval) {
            // Request approval through the handler
            const result = await handler.requestApproval(toolName, serverName, args, {
              description: `Execute ${toolName} on ${serverName}`,
              metadata: {
                riskLevel: 'medium',
                potentialImpact: [`Execute tool ${toolName} with provided arguments`],
              },
            });

            return result.approved;
          }

          return true; // Auto-approve if not required
        },
      });

      // Create agent instance with MCP tools
      const agentConfig: ArchestraAgentConfig = {
        model: selectedModel || 'gpt-4o',
        mcpTools,
        maxSteps: 10,
        temperature: 0.7,
        memoryConfig: {
          maxEntries: 1000,
          ttlSeconds: 3600,
          summarizationThreshold: 0.8,
        },
      };

      const agent = new ArchestraAgent(agentConfig);
      set({ agentInstance: agent });

      // Execute with streaming
      try {
        set({ mode: 'planning' });
        const streamResult = await agent.executeObjective(objective);

        // Create event handler with callbacks
        const callbacks = createAgentEventCallbacks(set, (toolCall) => get().handleToolExecution(toolCall));
        const eventHandler = new AgentEventHandler(callbacks);

        await eventHandler.handleStreamedResult(streamResult);

        set({ mode: 'completed' });
      } catch (error) {
        console.error('Agent execution error:', error);
        set({ mode: 'idle', isAgentActive: false });
        throw error;
      }
    },

    pauseAgent: () => {
      const { agentInstance } = get();
      if (!agentInstance || get().mode !== 'executing') {
        return;
      }

      agentInstance.pause();
      set({ mode: 'paused' });
    },

    resumeAgent: async () => {
      const { agentInstance } = get();
      if (!agentInstance || get().mode !== 'paused') {
        return;
      }

      set({ mode: 'executing' });

      try {
        const streamResult = await agentInstance.resume();
        if (streamResult) {
          // Create event handler with callbacks
          const callbacks = createAgentEventCallbacks(set, (toolCall) => get().handleToolExecution(toolCall));
          const eventHandler = new AgentEventHandler(callbacks);

          await eventHandler.handleStreamedResult(streamResult);
        }
        set({ mode: 'completed' });
      } catch (error) {
        console.error('Agent resume error:', error);
        set({ mode: 'idle', isAgentActive: false });
      }
    },

    stopAgent: () => {
      const { agentInstance } = get();
      if (agentInstance) {
        agentInstance.stop();
      }

      get().clearAgent();
    },

    sendAgentMessage: (message: string) => {
      const { agentInstance, isAgentActive } = get();
      if (!agentInstance || !isAgentActive) {
        return;
      }

      // Add to working memory
      agentInstance.addMemoryEntry('observation', `User message: ${message}`);

      // Send through chat
      const { sendChatMessage } = useChatStore.getState();
      const { selectedModel } = useOllamaStore.getState();
      sendChatMessage(message, selectedModel || 'gpt-4o');
    },

    setReasoningMode: (mode: 'verbose' | 'concise' | 'hidden') => {
      set({ reasoningMode: mode });
    },

    updatePlan: (plan: TaskPlan) => {
      set({ plan });
    },

    addReasoningEntry: (entry: ReasoningEntry) => {
      set((state) => ({
        reasoning: [...state.reasoning, entry],
      }));
    },

    updateWorkingMemory: (entry: MemoryEntry) => {
      const { agentInstance } = get();
      if (agentInstance) {
        agentInstance.addMemoryEntry(entry.type, entry.content, entry.metadata);
        set({ workingMemory: agentInstance.exportMemory() });
      }
    },

    // Memory management methods
    searchAgentMemory: (criteria: MemorySearchCriteria) => {
      const { agentInstance } = get();
      if (!agentInstance) return [];
      return agentInstance.searchMemory(criteria);
    },

    getMemoryContext: () => {
      const { agentInstance } = get();
      if (!agentInstance) return '';
      return agentInstance.getMemoryContext();
    },

    summarizeAgentMemory: async () => {
      const { agentInstance } = get();
      if (!agentInstance) return '';
      const summary = await agentInstance.summarizeMemory();
      set({ workingMemory: agentInstance.exportMemory() });
      return summary;
    },

    getMemoryStatistics: () => {
      const { agentInstance } = get();
      if (!agentInstance) return null;
      return agentInstance.getMemoryStatistics();
    },

    getRelatedMemories: (entryId: string, limit?: number) => {
      const { agentInstance } = get();
      if (!agentInstance) return [];
      return agentInstance.getRelatedMemories(entryId, limit);
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
      const { executeTool } = useMCPServersStore.getState();

      // Parse server and tool name
      const [serverName, ...toolParts] = toolCall.name.split('_');
      const toolName = toolParts.join('_');

      try {
        const result = await executeTool(serverName, {
          name: toolName,
          arguments: toolCall.arguments || {},
        });

        // Add to agent memory
        const { agentInstance } = get();
        if (agentInstance) {
          agentInstance.addMemoryEntry('result', `Tool ${toolName} executed successfully: ${JSON.stringify(result)}`, {
            toolName,
            serverName,
            result,
          });
        }

        return result;
      } catch (error) {
        console.error('Tool execution error:', error);
        const { agentInstance } = get();
        if (agentInstance) {
          agentInstance.addMemoryEntry(
            'error',
            `Tool ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`,
            { toolName, serverName, error: error instanceof Error ? error.message : String(error) }
          );
        }
        throw error;
      }
    },

    clearAgent: () => {
      const currentPreferences = get().preferences;
      set({
        mode: 'idle',
        currentObjective: null,
        currentAgent: undefined,
        plan: undefined,
        progress: { completed: 0, total: 0, currentStep: null },
        reasoning: [],
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
        // Preserve preferences across sessions
        preferences: currentPreferences,
      });
    },
  }))
);

// Store initialization and cleanup
function initializeAgentStore() {
  // Track previous chat history length to detect new messages
  let previousChatLength = 0;

  // Subscribe to chat store for user messages during agent execution
  const unsubscribeChatHistory = useChatStore.subscribe((state) => {
    const chatHistory = state.chatHistory;
    const agentState = useAgentStore.getState();

    // Check if a new message was added
    if (agentState.isAgentActive && chatHistory.length > previousChatLength) {
      const lastMessage = chatHistory[chatHistory.length - 1];
      if (lastMessage.role === 'user' && !lastMessage.toolCalls) {
        // Process user interaction during agent execution
        agentState.sendAgentMessage(lastMessage.content);
      }
    }

    previousChatLength = chatHistory.length;
  });

  // Cleanup on window unload
  const handleUnload = () => {
    const { agentInstance } = useAgentStore.getState();
    if (agentInstance) {
      agentInstance.cleanup();
    }
    unsubscribeChatHistory();
  };

  window.addEventListener('beforeunload', handleUnload);

  // Return cleanup function
  return () => {
    handleUnload();
    window.removeEventListener('beforeunload', handleUnload);
  };
}

// Initialize the store
const cleanupAgentStore = initializeAgentStore();

// Export cleanup function for testing
export { cleanupAgentStore };
