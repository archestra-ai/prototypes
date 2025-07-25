import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HumanInLoopHandler } from '@/services/agent/human-in-loop';
import type { AgentMode } from '@/types/agent';

// Import after mocks
import { useAgentStore } from '../agent-store';

// Mock dependencies
vi.mock('@/stores/chat-store', () => ({
  useChatStore: {
    getState: vi.fn(() => ({
      chatHistory: [],
    })),
    setState: vi.fn(),
  },
}));

vi.mock('@/stores/mcp-servers-store', () => ({
  useMCPServersStore: {
    getState: vi.fn(() => ({
      installedMCPServers: [
        {
          name: 'test-server',
          status: 'connected',
          tools: [
            {
              name: 'test_tool',
              description: 'Test tool',
              inputSchema: {},
            },
          ],
        },
      ],
      archestraMCPServer: {
        name: 'archestra',
        status: 'connected',
        tools: [],
      },
      executeTool: vi.fn().mockResolvedValue({ success: true }),
    })),
  },
}));

vi.mock('@/stores/ollama-store', () => ({
  useOllamaStore: {
    getState: vi.fn(() => ({
      selectedModel: 'llama3.2',
    })),
  },
}));

vi.mock('@/services/agent/model-provider', () => ({
  ModelCapabilities: {
    getProviderName: vi.fn(() => 'ollama'),
    supportsTools: vi.fn(() => true),
  },
  ModelProviderFactory: {
    create: vi.fn(() => ({
      createModel: vi.fn(() => ({})),
      getProviderName: vi.fn(() => 'ollama'),
    })),
  },
}));

vi.mock('@/services/agent/archestra-agent-v5', () => ({
  ArchestraAgentV5: vi.fn().mockImplementation((config) => ({
    id: 'test-agent-id',
    model: config.model,
    execute: vi.fn().mockResolvedValue({
      toStream: vi.fn(() => new ReadableStream()),
    }),
    executeObjective: vi.fn().mockResolvedValue({
      toStream: vi.fn(() => new ReadableStream()),
    }),
    pause: vi.fn(),
    resume: vi.fn().mockResolvedValue(null),
    stop: vi.fn(),
    cleanup: vi.fn(),
    getState: vi.fn(() => ({ mode: 'idle' })),
    addMemoryEntry: vi.fn(),
    exportMemory: vi.fn(() => ({
      id: 'memory-id',
      agentSessionId: 'session-id',
      entries: [],
      created: new Date(),
      lastAccessed: new Date(),
    })),
    searchMemory: vi.fn(() => []),
    getMemoryContext: vi.fn(() => 'Memory context'),
    summarizeMemory: vi.fn().mockResolvedValue('Memory summary'),
    getMemoryStatistics: vi.fn(() => ({ total: 0 })),
    getRelatedMemories: vi.fn(() => []),
    formatReasoningForUI: vi.fn((entry) => entry.content),
    getReasoningHistory: vi.fn(() => []),
    updateReasoningConfig: vi.fn(),
  })),
}));

vi.mock('@/services/agent/ai-sdk-native-agent', () => ({
  ArchestraAgentNative: vi.fn().mockImplementation(() => ({
    executeObjective: vi.fn().mockResolvedValue({
      toStream: vi.fn(() => new ReadableStream()),
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    cleanup: vi.fn(),
    addMemoryEntry: vi.fn(),
    exportMemory: vi.fn(() => ({
      id: 'memory-id',
      agentSessionId: 'session-id',
      entries: [],
      created: new Date(),
      lastAccessed: new Date(),
    })),
  })),
}));

describe('Agent Store Lifecycle Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useAgentStore.setState({
      mode: 'idle',
      isAgentActive: false,
      agentInstance: null,
      currentObjective: null,
      plan: undefined,
      progress: { completed: 0, total: 0, currentStep: null },
      reasoningText: [],
      streamingContent: undefined,
      streamingMessageId: null,
      useV5Implementation: true,
      stateBridge: null,
      preferences: {
        autoApproveCategories: [],
        autoApproveServers: [],
      },
    });
  });

  afterEach(() => {
    // Cleanup handled automatically
  });

  describe('Agent Activation', () => {
    it('should activate agent with objective', async () => {
      const { activateAgent } = useAgentStore.getState();

      await activateAgent('Test objective');

      const state = useAgentStore.getState();
      expect(state.currentObjective).toBe('Test objective');
      expect(state.isAgentActive).toBe(true);
      expect(state.agentInstance).toBeDefined();
    });

    it('should prevent activation when agent is already active', async () => {
      const { activateAgent } = useAgentStore.getState();

      // First activation
      await activateAgent('First objective');

      // Try to activate again
      await expect(activateAgent('Second objective')).rejects.toThrow('Agent is already active');
    });

    it('should create agent with correct tool configuration', async () => {
      const { activateAgent } = useAgentStore.getState();

      await activateAgent('Test with tools');

      const { ArchestraAgentV5 } = await import('@/services/agent/archestra-agent-v5');
      expect(ArchestraAgentV5).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'llama3.2',
          mcpTools: expect.any(Object),
          maxSteps: 30,
          temperature: 0.7,
          reasoningMode: 'verbose',
        })
      );
    });
  });

  describe('Agent Pause and Resume', () => {
    it('should pause executing agent', async () => {
      const { activateAgent, pauseAgent } = useAgentStore.getState();

      await activateAgent('Test objective');
      useAgentStore.setState({ mode: 'executing' });

      pauseAgent();

      const state = useAgentStore.getState();
      expect(state.mode).toBe('paused');
      expect(state.agentInstance?.pause).toHaveBeenCalled();
    });

    it('should not pause when not executing', () => {
      const { pauseAgent } = useAgentStore.getState();

      pauseAgent(); // Should do nothing

      const state = useAgentStore.getState();
      expect(state.mode).toBe('idle');
    });

    it('should resume paused agent', async () => {
      const { activateAgent, pauseAgent, resumeAgent } = useAgentStore.getState();

      await activateAgent('Test objective');
      useAgentStore.setState({ mode: 'executing' });
      pauseAgent();

      await resumeAgent();

      const state = useAgentStore.getState();
      expect(state.mode).toBe('completed'); // After stream handling
      expect(state.agentInstance?.resume).toHaveBeenCalled();
    });

    it('should not resume when not paused', async () => {
      const { resumeAgent } = useAgentStore.getState();

      await resumeAgent(); // Should do nothing

      const state = useAgentStore.getState();
      expect(state.mode).toBe('idle');
    });
  });

  describe('Agent Stop', () => {
    it('should stop agent and clear state', async () => {
      const { activateAgent, stopAgent } = useAgentStore.getState();

      await activateAgent('Test objective');
      const { agentInstance } = useAgentStore.getState();

      stopAgent();

      const state = useAgentStore.getState();
      expect(state.mode).toBe('idle');
      expect(state.isAgentActive).toBe(false);
      expect(state.agentInstance).toBeNull();
      expect(state.currentObjective).toBeNull();
      expect(agentInstance?.stop).toHaveBeenCalled();
    });
  });

  describe('Tool Approval Flow', () => {
    it('should auto-approve tools in approved categories', async () => {
      const { activateAgent, updatePreferences } = useAgentStore.getState();

      // Set auto-approve for test server
      updatePreferences({
        autoApproveServers: ['test-server'],
      });

      await activateAgent('Test with auto-approval');

      // Tool should be created with auto-approval
      const state = useAgentStore.getState();
      expect(state.preferences.autoApproveServers).toContain('test-server');
    });

    it('should request approval for non-approved tools', async () => {
      // Set up mock handler
      const mockHandler = {
        requiresApproval: vi.fn().mockResolvedValue(true),
        requestApproval: vi.fn().mockResolvedValue({ approved: true }),
      } as unknown as HumanInLoopHandler;

      (window as any).__toolApprovalHandler = mockHandler;

      const { activateAgent, handleToolExecution } = useAgentStore.getState();

      await activateAgent('Test with approval');

      await handleToolExecution({
        name: 'test-server_test_tool',
        arguments: { param: 'value' },
      });

      expect(mockHandler.requiresApproval).toHaveBeenCalled();
      expect(mockHandler.requestApproval).toHaveBeenCalled();

      delete (window as any).__toolApprovalHandler;
    });
  });

  describe('Task Progress Updates', () => {
    it('should update task progress', async () => {
      const { activateAgent, updateProgress } = useAgentStore.getState();

      await activateAgent('Test progress');

      updateProgress({
        completed: 5,
        total: 10,
        currentStep: 'Processing data',
        percentComplete: 50,
      });

      const state = useAgentStore.getState();
      expect(state.progress.completed).toBe(5);
      expect(state.progress.total).toBe(10);
      expect(state.progress.currentStep).toBe('Processing data');
      expect(state.progress.percentComplete).toBe(50);
    });

    it('should accumulate progress updates', () => {
      const { updateProgress } = useAgentStore.getState();

      updateProgress({ completed: 1, total: 5 });
      updateProgress({ completed: 2 });
      updateProgress({ currentStep: 'Step 2' });

      const state = useAgentStore.getState();
      expect(state.progress.completed).toBe(2);
      expect(state.progress.total).toBe(5);
      expect(state.progress.currentStep).toBe('Step 2');
    });
  });

  describe('State Synchronization', () => {
    it('should maintain state consistency across mode changes', async () => {
      const { activateAgent, setAgentMode } = useAgentStore.getState();
      const modeHistory: AgentMode[] = [];

      // Track mode changes
      const unsubscribe = useAgentStore.subscribe(
        (state) => state.mode,
        (mode) => modeHistory.push(mode)
      );

      await activateAgent('Test state sync');
      setAgentMode('planning');
      setAgentMode('executing');
      setAgentMode('completed');

      expect(modeHistory).toEqual(expect.arrayContaining(['planning', 'executing', 'completed']));

      unsubscribe();
    });

    it('should preserve preferences across agent sessions', async () => {
      const { activateAgent, stopAgent, updatePreferences } = useAgentStore.getState();

      // Set preferences
      updatePreferences({
        autoApproveServers: ['server1', 'server2'],
      });

      // Activate and stop agent
      await activateAgent('First session');
      stopAgent();

      // Preferences should persist
      const state = useAgentStore.getState();
      expect(state.preferences.autoApproveServers).toEqual(['server1', 'server2']);

      // Activate again
      await activateAgent('Second session');

      const newState = useAgentStore.getState();
      expect(newState.preferences.autoApproveServers).toEqual(['server1', 'server2']);
    });

    it('should sync working memory updates', async () => {
      const { activateAgent, updateWorkingMemory } = useAgentStore.getState();

      await activateAgent('Test memory sync');

      const entry = {
        id: 'entry-1',
        type: 'observation' as const,
        content: 'User input received',
        timestamp: new Date(),
        metadata: { source: 'user' },
        relevanceScore: 0.8,
      };

      updateWorkingMemory(entry);

      const state = useAgentStore.getState();
      expect(state.workingMemory.entries).toContainEqual(entry);
      expect(state.agentInstance?.addMemoryEntry).toHaveBeenCalledWith('observation', 'User input received', {
        source: 'user',
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle activation errors gracefully', async () => {
      const { ArchestraAgentV5 } = await import('@/services/agent/archestra-agent-v5');
      vi.mocked(ArchestraAgentV5).mockImplementationOnce(() => {
        throw new Error('Agent creation failed');
      });

      const { activateAgent } = useAgentStore.getState();

      await expect(activateAgent('Test error')).rejects.toThrow('Agent creation failed');

      const state = useAgentStore.getState();
      expect(state.mode).toBe('idle');
      expect(state.isAgentActive).toBe(false);
    });

    it('should handle execution errors and update state', async () => {
      const { activateAgent } = useAgentStore.getState();

      const { ArchestraAgentV5 } = await import('@/services/agent/archestra-agent-v5');
      vi.mocked(ArchestraAgentV5).mockImplementationOnce(
        (config) =>
          ({
            id: 'test-agent-id',
            model: config.model,
            execute: vi.fn().mockRejectedValue(new Error('Execution failed')),
            executeObjective: vi.fn().mockRejectedValue(new Error('Execution failed')),
            cleanup: vi.fn(),
            // ... other methods
          }) as any
      );

      await activateAgent('Test execution error');

      // Wait for async error handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = useAgentStore.getState();
      expect(state.mode).toBe('idle');
      expect(state.isAgentActive).toBe(false);
    });
  });

  describe('Agent Message Handling', () => {
    it('should send agent message and update memory', async () => {
      const { activateAgent, sendAgentMessage } = useAgentStore.getState();

      await activateAgent('Test messaging');

      sendAgentMessage('User message to agent');

      const state = useAgentStore.getState();
      expect(state.agentInstance?.addMemoryEntry).toHaveBeenCalledWith(
        'observation',
        'User message: User message to agent'
      );
    });

    it('should not send message when agent is not active', () => {
      const { sendAgentMessage } = useAgentStore.getState();

      sendAgentMessage('Message without active agent');

      // Should not throw and not do anything
      const state = useAgentStore.getState();
      expect(state.agentInstance).toBeNull();
    });
  });
});
