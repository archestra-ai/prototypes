import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { ArchestraAgent, MemorySearchCriteria, ModelCapabilities } from '../services/agent';
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
  console.log('🎨 [AgentEventCallbacks] Creating callbacks');

  return {
    onStateChange: (state: Partial<AgentState>) => {
      console.log('📝 [AgentEventCallbacks] State change:', state);
      setState(state);
    },

    onToolExecution: async (tool: any) => {
      console.log('🔨 [AgentEventCallbacks] Tool execution requested:', tool);
      return handleToolExecution(tool);
    },

    onMessage: (message: string) => {
      console.log('💬 [AgentEventCallbacks] Message received:', message);

      // Accumulate streaming content
      setState((state: AgentStoreState) => {
        const currentContent = state.streamingContent || '';
        return {
          streamingContent: currentContent + message,
        };
      });
    },

    onReasoningUpdate: (entry: ReasoningEntry) => {
      console.log('🧠 [AgentEventCallbacks] Reasoning update:', entry);
      setState((state: AgentStoreState) => ({
        reasoning: [...state.reasoning, entry],
      }));
    },

    onProgressUpdate: (progress: Partial<TaskProgress>) => {
      console.log('📊 [AgentEventCallbacks] Progress update:', progress);
      setState((state: AgentStoreState) => ({
        progress: { ...state.progress, ...progress },
      }));
    },

    onMemoryUpdate: (entry: MemoryEntry) => {
      console.log('🧩 [AgentEventCallbacks] Memory update:', entry);
      setState((state: AgentStoreState) => ({
        workingMemory: {
          ...state.workingMemory,
          entries: [...state.workingMemory.entries, entry],
          lastAccessed: new Date(),
        },
      }));
    },

    onError: (error: any) => {
      console.error('💥 [AgentEventCallbacks] Error received:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
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
  streamingMessageId: string | null;
  streamingUpdateInterval: NodeJS.Timeout | null;
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
    streamingMessageId: null,
    streamingUpdateInterval: null,
    preferences: {
      autoApproveCategories: ['read', 'search'] as ToolCategory[],
      autoApproveServers: [],
    },

    // Actions
    activateAgent: async (objective: string) => {
      console.log('🚀 [AgentStore] activateAgent called with:', objective);

      const state = get();
      if (state.isAgentActive && state.mode !== 'idle') {
        console.error('❌ [AgentStore] Agent already active');
        throw new Error('Agent is already active');
      }

      const { installedMCPServers, archestraMCPServer } = useMCPServersStore.getState();
      const { selectedModel } = useOllamaStore.getState();

      console.log('📊 [AgentStore] Current configuration:', {
        selectedModel,
        installedServersCount: installedMCPServers.length,
        archestraServerStatus: archestraMCPServer.status,
      });

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

      console.log('🔧 [AgentStore] Extracting MCP tools from servers:', allServers.length);

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

      // Check if model supports tools
      const modelName = selectedModel || 'gpt-4o';
      const supportsTools = ModelCapabilities.supportsTools(modelName);

      console.log('🤖 [AgentStore] Model configuration:', {
        modelName,
        supportsTools,
        mcpToolsCount: mcpTools.length,
      });

      if (!supportsTools && mcpTools.length > 0) {
        // Warn user that tools won't be available
        const { chatHistory } = useChatStore.getState();
        useChatStore.setState({
          chatHistory: [
            ...chatHistory,
            {
              id: Date.now().toString(),
              role: 'system' as const,
              content: `ℹ️ Model '${modelName}' does not support tool calling. The agent will provide step-by-step instructions instead of directly executing actions.`,
              timestamp: new Date(),
            },
          ],
        });
      }

      // Create agent instance with MCP tools
      const agentConfig: ArchestraAgentConfig = {
        model: modelName,
        mcpTools,
        maxSteps: 10,
        temperature: 0.7,
        reasoningMode: state.reasoningMode,
        memoryConfig: {
          maxEntries: 1000,
          ttlSeconds: 3600,
          summarizationThreshold: 0.8,
        },
      };

      console.log('🏗️ [AgentStore] Creating ArchestraAgent with config:', agentConfig);

      const agent = new ArchestraAgent(agentConfig);
      set({ agentInstance: agent });

      console.log('✅ [AgentStore] Agent created successfully');

      // Execute with streaming
      try {
        console.log('🎯 [AgentStore] Starting agent execution');
        set({ mode: 'planning', streamingContent: '' });

        // Create initial assistant message in chat
        const { chatHistory } = useChatStore.getState();
        const assistantMessageId = Date.now().toString();
        useChatStore.setState({
          chatHistory: [
            ...chatHistory,
            {
              id: assistantMessageId,
              role: 'assistant' as const,
              content: '',
              timestamp: new Date(),
              isStreaming: true,
              isFromAgent: true,
            },
          ],
        });
        set({ streamingMessageId: assistantMessageId });

        const updateInterval = setInterval(() => {
          const { streamingContent, streamingMessageId } = get();
          if (streamingMessageId && streamingContent) {
            const { chatHistory } = useChatStore.getState();
            useChatStore.setState({
              chatHistory: chatHistory.map((msg) =>
                msg.id === streamingMessageId
                  ? {
                      ...msg,
                      content: streamingContent,
                      isStreaming: true,
                    }
                  : msg
              ),
            });
          }
        }, 100);

        set({ streamingUpdateInterval: updateInterval });

        console.log('📞 [AgentStore] Calling agent.executeObjective');
        const streamResult = await agent.executeObjective(objective);
        console.log('📦 [AgentStore] executeObjective returned:', {
          streamResultType: typeof streamResult,
          hasToStream: streamResult && typeof (streamResult as any).toStream === 'function',
          streamResultKeys: streamResult ? Object.keys(streamResult) : [],
        });

        // Convert to stream if it's a StreamedRunResult
        let stream = streamResult;
        if (streamResult && typeof (streamResult as any).toStream === 'function') {
          console.log('🔄 [AgentStore] Converting StreamedRunResult to stream');
          stream = (streamResult as any).toStream();
          console.log('✅ [AgentStore] Stream converted:', {
            streamType: typeof stream,
            streamConstructor: stream?.constructor?.name,
            isReadableStream: stream instanceof ReadableStream,
            hasAsyncIterator: stream && typeof stream[Symbol.asyncIterator],
            hasGetReader: stream && typeof stream.getReader === 'function',
          });
        }

        // Create event handler with callbacks
        console.log('🎭 [AgentStore] Creating event handler');
        const callbacks = createAgentEventCallbacks(set, (toolCall) => get().handleToolExecution(toolCall));
        const eventHandler = new AgentEventHandler(callbacks);

        console.log('🌊 [AgentStore] Starting stream processing');
        await eventHandler.handleStreamedResult(stream);
        console.log('✅ [AgentStore] Stream processing completed');

        // Clear the update interval
        const { streamingUpdateInterval } = get();
        if (streamingUpdateInterval) {
          clearInterval(streamingUpdateInterval);
        }

        // Finalize the assistant message with accumulated content
        const { streamingContent, streamingMessageId } = get();
        if (streamingMessageId && streamingContent) {
          const { chatHistory } = useChatStore.getState();
          useChatStore.setState({
            chatHistory: chatHistory.map((msg) =>
              msg.id === streamingMessageId
                ? {
                    ...msg,
                    content: streamingContent,
                    isStreaming: false,
                  }
                : msg
            ),
          });
        }

        set({ mode: 'completed', streamingContent: '', streamingMessageId: null, streamingUpdateInterval: null });
        console.log('🏁 [AgentStore] Agent execution completed successfully');
      } catch (error) {
        console.error('💥 [AgentStore] Agent execution error:', error);
        console.error('Error details:', {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        // Add error message to chat
        const { chatHistory } = useChatStore.getState();
        const errorMessage = error instanceof Error ? error.message : String(error);
        let friendlyError = `Agent error: ${errorMessage}`;

        if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
          friendlyError =
            'Failed to connect to the AI model. Please ensure Ollama is running and the selected model is installed.';
        } else if (
          errorMessage.includes('502') ||
          errorMessage.includes('Bad Gateway') ||
          errorMessage.includes('Proxy error')
        ) {
          friendlyError =
            'Cannot connect to Ollama. Please ensure:\n1. Ollama is running (run `ollama serve` in terminal)\n2. The Archestra proxy server is running\n3. Try again in a few seconds as services may still be starting up';
        }

        useChatStore.setState({
          chatHistory: [
            ...chatHistory,
            {
              id: Date.now().toString(),
              role: 'system' as const,
              content: `❌ ${friendlyError}`,
              timestamp: new Date(),
            },
          ],
        });

        // Clear the update interval on error
        const { streamingUpdateInterval } = get();
        if (streamingUpdateInterval) {
          clearInterval(streamingUpdateInterval);
        }

        set({ mode: 'idle', isAgentActive: false, streamingUpdateInterval: null });
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
          // Convert to stream if it's a StreamedRunResult
          let stream = streamResult;
          if (streamResult && typeof (streamResult as any).toStream === 'function') {
            stream = (streamResult as any).toStream();
          }

          // Create event handler with callbacks
          const callbacks = createAgentEventCallbacks(set, (toolCall) => get().handleToolExecution(toolCall));
          const eventHandler = new AgentEventHandler(callbacks);

          await eventHandler.handleStreamedResult(stream);
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
      sendChatMessage(message);
    },

    setReasoningMode: (mode: 'verbose' | 'concise' | 'hidden') => {
      set({ reasoningMode: mode });
      // Update agent instance reasoning config if it exists
      const { agentInstance } = get();
      if (agentInstance) {
        agentInstance.updateReasoningConfig({ verbosityLevel: mode });
      }
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

    // Reasoning operations
    formatReasoningForUI: (entry: ReasoningEntry) => {
      const { agentInstance, reasoningMode } = get();
      if (!agentInstance) {
        // Fallback formatting if no agent instance
        if (reasoningMode === 'hidden') return '';
        return entry.content;
      }
      return agentInstance.formatReasoningForUI(entry, reasoningMode);
    },

    getFormattedReasoningHistory: (limit?: number) => {
      const { reasoning, reasoningMode, agentInstance } = get();
      const entries = limit ? reasoning.slice(-limit) : reasoning;

      return entries.map((entry) => ({
        entry,
        formatted: agentInstance ? agentInstance.formatReasoningForUI(entry, reasoningMode) : entry.content,
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
let cleanupAgentStore: (() => void) | null = null;

function initializeAgentStore() {
  // Prevent multiple initializations
  if (cleanupAgentStore) {
    return cleanupAgentStore;
  }

  // Track previous chat history length to detect new messages
  let previousChatLength = 0;
  let isProcessingMessage = false;

  // Initialize agent instance if not already active
  const agentState = useAgentStore.getState();
  if (!agentState.agentInstance && agentState.isAgentActive) {
    // Create agent instance on startup
    const { installedMCPServers, archestraMCPServer } = useMCPServersStore.getState();
    const { selectedModel } = useOllamaStore.getState();

    const allServers = [...installedMCPServers];
    if (archestraMCPServer.status === 'connected') {
      allServers.push(archestraMCPServer);
    }

    const mcpTools = extractMCPTools(allServers, {
      autoApproveCategories: agentState.preferences.autoApproveCategories,
      autoApproveServers: agentState.preferences.autoApproveServers,
    });

    const agentConfig: ArchestraAgentConfig = {
      model: selectedModel || 'gpt-4o',
      mcpTools,
      maxSteps: 10,
      temperature: 0.7,
      reasoningMode: agentState.reasoningMode,
      memoryConfig: {
        maxEntries: 1000,
        ttlSeconds: 3600,
        summarizationThreshold: 0.8,
      },
    };

    const agent = new ArchestraAgent(agentConfig);
    useAgentStore.setState({ agentInstance: agent });
  }

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

          // Process user interaction during agent execution - but not by calling sendAgentMessage
          // which would create a loop. Instead, just add to memory
          if (agentState.agentInstance) {
            agentState.agentInstance.addMemoryEntry('observation', `User message: ${lastMessage.content}`);
          }

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
      const { agentInstance } = useAgentStore.getState();
      if (agentInstance) {
        agentInstance.cleanup();
      }
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
