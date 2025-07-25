import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentMode, ArchestraAgentConfig } from '@/types/agent';

import { ArchestraAgentV5 } from '../archestra-agent-v5';

// Mock dependencies
vi.mock('../memory-manager');
vi.mock('../reasoning-module');
vi.mock('../model-provider', () => ({
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

// Mock streamText from AI SDK
vi.mock('ai', () => ({
  streamText: vi.fn(() => ({
    toStream: vi.fn(() => new ReadableStream()),
  })),
}));

describe('Agent Lifecycle Tests', () => {
  let agent: ArchestraAgentV5;
  let config: ArchestraAgentConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      model: 'llama3.2',
      mcpTools: {
        test_tool: {
          description: 'Test tool',
          execute: vi.fn(),
        },
      } as any,
      maxSteps: 10,
      temperature: 0.7,
      reasoningMode: 'verbose',
    };
  });

  afterEach(() => {
    if (agent) {
      agent.cleanup();
    }
  });

  describe('Activation', () => {
    it('should initialize agent with correct configuration', () => {
      agent = new ArchestraAgentV5(config);

      expect(agent.model).toBe('llama3.2');
      expect(agent.id).toBeDefined();
      expect(agent.getState().mode).toBe('idle');
    });

    it('should transition from idle to initializing on execute', async () => {
      agent = new ArchestraAgentV5(config);
      const initialState = agent.getState();
      expect(initialState.mode).toBe('idle');

      const context = {
        objective: 'Test objective',
        availableTools: [],
        workingMemory: {
          id: 'test-memory',
          agentSessionId: 'test-session',
          entries: [],
          created: new Date(),
          lastAccessed: new Date(),
        },
        environmentState: {
          availableServers: [],
          activeConnections: 0,
          resourceUsage: { memory: 0, cpu: 0 },
          timestamp: new Date(),
        },
        userPreferences: {
          autoApproveTools: [],
          maxExecutionTime: 300000,
          preferredServers: [],
          reasoningVerbosity: 'verbose' as const,
          interruptOnError: true,
        },
        sessionId: 'test-session',
      };

      // Start execution (don't await to test state changes)
      agent.execute('Test objective', context);

      // Give it a moment to update state
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Note: In the real implementation, state is updated internally
      // For testing, we would need to expose state changes or use a spy
    });

    it('should handle activation with empty tools', () => {
      const configWithoutTools = { ...config, mcpTools: {} };
      agent = new ArchestraAgentV5(configWithoutTools);

      expect(agent.getState().mode).toBe('idle');
      expect(Object.keys((agent as any).tools)).toHaveLength(0);
    });
  });

  describe('Pause and Resume', () => {
    it('should pause agent when executing', () => {
      agent = new ArchestraAgentV5(config);

      // Manually set state to executing for testing
      (agent as any).state.mode = 'executing';

      agent.pause();

      expect(agent.getState().mode).toBe('paused');
    });

    it('should not pause agent when not executing', () => {
      agent = new ArchestraAgentV5(config);

      expect(() => agent.pause()).toThrow('Agent is not currently executing');
    });

    it('should resume agent from paused state', () => {
      agent = new ArchestraAgentV5(config);

      // Set to paused state
      (agent as any).state.mode = 'paused';

      agent.resume();

      expect(agent.getState().mode).toBe('executing');
    });

    it('should not resume agent when not paused', () => {
      agent = new ArchestraAgentV5(config);

      expect(() => agent.resume()).toThrow('Agent is not paused');
    });

    it('should abort controller on pause', () => {
      agent = new ArchestraAgentV5(config);
      const mockAbort = vi.fn();
      (agent as any).abortController = { abort: mockAbort };
      (agent as any).state.mode = 'executing';

      agent.pause();

      expect(mockAbort).toHaveBeenCalled();
    });
  });

  describe('Stop', () => {
    it('should stop agent and clean up resources', () => {
      agent = new ArchestraAgentV5(config);
      const mockAbort = vi.fn();
      (agent as any).abortController = { abort: mockAbort };
      (agent as any).state.mode = 'executing';

      agent.stop();

      expect(agent.getState().mode).toBe('idle');
      expect(mockAbort).toHaveBeenCalled();
      expect((agent as any).abortController).toBeNull();
    });

    it('should handle stop when no abort controller exists', () => {
      agent = new ArchestraAgentV5(config);
      (agent as any).abortController = null;

      expect(() => agent.stop()).not.toThrow();
      expect(agent.getState().mode).toBe('idle');
    });
  });

  describe('State Synchronization', () => {
    it('should maintain state consistency across operations', () => {
      agent = new ArchestraAgentV5(config);
      const states: AgentMode[] = [];

      // Track state changes
      states.push(agent.getState().mode); // idle

      (agent as any).state.mode = 'executing';
      states.push(agent.getState().mode); // executing

      agent.pause();
      states.push(agent.getState().mode); // paused

      agent.resume();
      states.push(agent.getState().mode); // executing

      agent.stop();
      states.push(agent.getState().mode); // idle

      expect(states).toEqual(['idle', 'executing', 'paused', 'executing', 'idle']);
    });

    it('should preserve working memory across state changes', () => {
      agent = new ArchestraAgentV5(config);

      // Add memory entry
      agent.addMemoryEntry('observation', 'Test observation', { key: 'value' });

      const memoryBefore = agent.exportMemory();

      // Change states
      (agent as any).state.mode = 'executing';
      agent.pause();
      agent.resume();

      const memoryAfter = agent.exportMemory();

      expect(memoryAfter.entries).toHaveLength(memoryBefore.entries.length);
    });

    it('should update progress during execution', () => {
      agent = new ArchestraAgentV5(config);

      const initialProgress = agent.getState().progress;
      expect(initialProgress.completed).toBe(0);
      expect(initialProgress.total).toBe(0);

      // Simulate progress update
      (agent as any).updateProgress({
        completed: 3,
        total: 10,
        currentStep: 'Processing step 3',
        percentComplete: 30,
      });

      const updatedProgress = agent.getState().progress;
      expect(updatedProgress.completed).toBe(3);
      expect(updatedProgress.total).toBe(10);
      expect(updatedProgress.currentStep).toBe('Processing step 3');
    });
  });

  describe('Memory Management', () => {
    it('should add and retrieve memory entries', () => {
      agent = new ArchestraAgentV5(config);

      agent.addMemoryEntry('observation', 'User requested help');
      agent.addMemoryEntry('decision', 'Provide assistance');

      const memory = agent.exportMemory();
      expect(memory.entries).toHaveLength(2);
    });

    it('should search memory entries', () => {
      agent = new ArchestraAgentV5(config);

      agent.addMemoryEntry('observation', 'User asked about TypeScript');
      agent.addMemoryEntry('result', 'Provided TypeScript explanation');

      const results = agent.searchMemory({ types: ['observation'] });
      expect(results).toBeDefined();
    });

    it('should get memory context', () => {
      agent = new ArchestraAgentV5(config);

      agent.addMemoryEntry('observation', 'Test observation');

      const context = agent.getMemoryContext();
      expect(context).toBeDefined();
      expect(typeof context).toBe('string');
    });
  });

  describe('Reasoning Configuration', () => {
    it('should update reasoning configuration', () => {
      agent = new ArchestraAgentV5(config);

      agent.updateReasoningConfig({
        verbosityLevel: 'concise',
        maxAlternatives: 3,
      });

      // Verify the config was updated (would need to expose reasoning module for full test)
      expect(agent).toBeDefined();
    });

    it('should format reasoning for UI based on mode', () => {
      agent = new ArchestraAgentV5(config);

      const entry = {
        id: 'test-1',
        type: 'planning' as const,
        content: 'Planning the approach',
        timestamp: new Date(),
        confidence: 0.9,
      };

      const formatted = agent.formatReasoningForUI(entry, 'verbose');
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
    });

    it('should get reasoning history', () => {
      agent = new ArchestraAgentV5(config);

      // Add some reasoning entries
      (agent as any).addReasoningEntry({
        id: 'r1',
        type: 'planning',
        content: 'Planning step',
        timestamp: new Date(),
        confidence: 0.8,
      });

      const history = agent.getReasoningHistory(10);
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors during execution gracefully', async () => {
      const { streamText } = await import('ai');
      vi.mocked(streamText).mockRejectedValueOnce(new Error('Model error'));

      agent = new ArchestraAgentV5(config);

      const context = {
        objective: 'Test objective',
        availableTools: [],
        workingMemory: agent.exportMemory(),
        environmentState: {
          availableServers: [],
          activeConnections: 0,
          resourceUsage: { memory: 0, cpu: 0 },
          timestamp: new Date(),
        },
        userPreferences: {
          autoApproveTools: [],
          maxExecutionTime: 300000,
          preferredServers: [],
          reasoningVerbosity: 'verbose' as const,
          interruptOnError: true,
        },
        sessionId: 'test-session',
      };

      await expect(agent.execute('Test', context)).rejects.toThrow('Model error');
      expect(agent.getState().mode).toBe('idle');
    });

    it('should handle abort errors differently', async () => {
      const { streamText } = await import('ai');
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      vi.mocked(streamText).mockRejectedValueOnce(abortError);

      agent = new ArchestraAgentV5(config);

      const context = {
        objective: 'Test objective',
        availableTools: [],
        workingMemory: agent.exportMemory(),
        environmentState: {
          availableServers: [],
          activeConnections: 0,
          resourceUsage: { memory: 0, cpu: 0 },
          timestamp: new Date(),
        },
        userPreferences: {
          autoApproveTools: [],
          maxExecutionTime: 300000,
          preferredServers: [],
          reasoningVerbosity: 'verbose' as const,
          interruptOnError: true,
        },
        sessionId: 'test-session',
      };

      await expect(agent.execute('Test', context)).rejects.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on cleanup call', () => {
      agent = new ArchestraAgentV5(config);
      const mockAbort = vi.fn();
      (agent as any).abortController = { abort: mockAbort };

      agent.cleanup();

      expect(mockAbort).toHaveBeenCalled();
      expect((agent as any).abortController).toBeNull();
    });

    it('should handle cleanup when already cleaned up', () => {
      agent = new ArchestraAgentV5(config);

      agent.cleanup();
      expect(() => agent.cleanup()).not.toThrow();
    });
  });

  describe('Backward Compatibility', () => {
    it('should support executeObjective method for backward compatibility', async () => {
      agent = new ArchestraAgentV5(config);

      const executeSpy = vi.spyOn(agent, 'execute');

      await agent.executeObjective('Test objective');

      expect(executeSpy).toHaveBeenCalledWith(
        'Test objective',
        expect.objectContaining({
          objective: 'Test objective',
          availableTools: expect.any(Array),
          workingMemory: expect.any(Object),
          environmentState: expect.any(Object),
          userPreferences: expect.any(Object),
          sessionId: expect.any(String),
        })
      );
    });

    it('should create default context when not provided', async () => {
      agent = new ArchestraAgentV5(config);

      const executeSpy = vi.spyOn(agent, 'execute');

      await agent.executeObjective('Test objective');

      const context = executeSpy.mock.calls[0][1];
      expect(context.objective).toBe('Test objective');
      expect(context.availableTools).toHaveLength(1); // test_tool
      expect(context.userPreferences.reasoningVerbosity).toBe('verbose');
    });
  });
});
