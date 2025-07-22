import { beforeEach, describe, expect, it } from 'vitest';

import { AgentContext, Alternative, ReasoningEntry, TaskStep } from '../../../types/agent';
import { ReasoningModule } from '../reasoning-module';

describe('ReasoningModule', () => {
  let reasoningModule: ReasoningModule;

  beforeEach(() => {
    reasoningModule = new ReasoningModule({
      maxAlternatives: 5,
      minConfidenceThreshold: 0.6,
      verbosityLevel: 'verbose',
      enableExplanations: true,
    });
  });

  describe('createPlanningReasoning', () => {
    it('should create a planning reasoning entry', () => {
      const objective = 'Search for TypeScript files';
      const steps: TaskStep[] = [
        {
          id: '1',
          description: 'List files in src directory',
          toolsRequired: ['file_search'],
          estimatedDuration: 1000,
          status: 'pending',
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: '2',
          description: 'Filter for .ts files',
          toolsRequired: ['filter'],
          estimatedDuration: 500,
          status: 'pending',
          retryCount: 0,
          maxRetries: 3,
        },
      ];

      const entry = reasoningModule.createPlanningReasoning(objective, steps);

      expect(entry).toBeDefined();
      expect(entry.type).toBe('planning');
      expect(entry.content).toContain(objective);
      expect(entry.content).toContain('List files in src directory');
      expect(entry.confidence).toBeGreaterThan(0);
      expect(entry.confidence).toBeLessThanOrEqual(1);
    });

    it('should calculate lower confidence for failed steps', () => {
      const steps: TaskStep[] = [
        {
          id: '1',
          description: 'Step 1',
          toolsRequired: [],
          estimatedDuration: 1000,
          status: 'completed',
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: '2',
          description: 'Step 2',
          toolsRequired: [],
          estimatedDuration: 1000,
          status: 'failed',
          retryCount: 3,
          maxRetries: 3,
        },
      ];

      const entry = reasoningModule.createPlanningReasoning('Test objective', steps);
      expect(entry.confidence).toBeLessThan(0.8);
    });
  });

  describe('createDecisionReasoning', () => {
    it('should create a decision reasoning entry', () => {
      const decision = 'Select tool for file search';
      const alternatives: Alternative[] = [
        {
          id: 'alt1',
          description: 'Use ripgrep for fast search',
          pros: ['Very fast', 'Supports regex'],
          cons: ['Requires installation'],
          feasibility: 0.9,
          estimatedDuration: 100,
        },
        {
          id: 'alt2',
          description: 'Use built-in file search',
          pros: ['No dependencies', 'Always available'],
          cons: ['Slower performance'],
          feasibility: 0.7,
          estimatedDuration: 500,
        },
      ];

      const context = {
        objective: 'Find TypeScript files',
        currentState: 'executing',
        availableResources: ['ripgrep', 'file_search'],
        constraints: [],
        previousDecisions: [],
      };

      const entry = reasoningModule.createDecisionReasoning(decision, alternatives, 'alt1', context);

      expect(entry).toBeDefined();
      expect(entry.type).toBe('decision');
      expect(entry.selectedOption).toBe('alt1');
      expect(entry.alternatives).toHaveLength(2);
      expect(entry.content).toContain('Select tool for file search');
      expect(entry.content).toContain('ripgrep');
    });
  });

  describe('createEvaluationReasoning', () => {
    it('should create an evaluation reasoning entry', () => {
      const evaluation = 'Task completion progress';
      const metrics = {
        stepsCompleted: 3,
        totalSteps: 5,
        successRate: 0.8,
        timeElapsed: 2500,
      };
      const confidence = 0.85;

      const entry = reasoningModule.createEvaluationReasoning(evaluation, metrics, confidence);

      expect(entry).toBeDefined();
      expect(entry.type).toBe('evaluation');
      expect(entry.confidence).toBe(0.85);
      expect(entry.content).toContain('Task completion progress');
      expect(entry.content).toContain('stepsCompleted: 3');
    });
  });

  describe('createAdaptationReasoning', () => {
    it('should create an adaptation reasoning entry', () => {
      const reason = 'Tool execution failed';
      const originalPlan = 'Use ripgrep for search';
      const adaptedPlan = 'Fall back to built-in search';
      const triggerEvent = 'Ripgrep not available';

      const entry = reasoningModule.createAdaptationReasoning(reason, originalPlan, adaptedPlan, triggerEvent);

      expect(entry).toBeDefined();
      expect(entry.type).toBe('adaptation');
      expect(entry.content).toContain(reason);
      expect(entry.content).toContain(originalPlan);
      expect(entry.content).toContain(adaptedPlan);
      expect(entry.content).toContain(triggerEvent);
    });
  });

  describe('generateAlternatives', () => {
    it('should generate alternatives for tool selection', () => {
      const context: AgentContext = {
        objective: 'Search files',
        availableTools: [
          {
            name: 'grep',
            serverName: 'filesystem',
            capabilities: ['search', 'regex'],
            performance: {
              averageLatency: 100,
              successRate: 0.95,
            },
            requiresPermission: false,
          },
          {
            name: 'find',
            serverName: 'filesystem',
            capabilities: ['search', 'list'],
            performance: {
              averageLatency: 200,
              successRate: 0.9,
            },
            requiresPermission: false,
          },
        ],
        workingMemory: {
          id: 'test',
          agentSessionId: 'test',
          entries: [],
          created: new Date(),
          lastAccessed: new Date(),
        },
        environmentState: {
          availableServers: ['filesystem'],
          activeConnections: 1,
          resourceUsage: { memory: 50, cpu: 30 },
          timestamp: new Date(),
        },
        userPreferences: {
          autoApproveTools: [],
          maxExecutionTime: 5000,
          preferredServers: [],
          reasoningVerbosity: 'verbose',
          interruptOnError: true,
        },
        sessionId: 'test-session',
      };

      const alternatives = reasoningModule.generateAlternatives('tool selection for file search', context, 3);

      expect(alternatives).toBeDefined();
      expect(alternatives.length).toBeGreaterThan(0);
      expect(alternatives.length).toBeLessThanOrEqual(3);

      // Should include tool-specific alternatives
      const toolAlternatives = alternatives.filter(
        (alt) => alt.description.includes('grep') || alt.description.includes('find')
      );
      expect(toolAlternatives.length).toBeGreaterThan(0);
    });

    it('should generate generic alternatives when no specific context', () => {
      const context: AgentContext = {
        objective: 'Generic task',
        availableTools: [],
        workingMemory: {
          id: 'test',
          agentSessionId: 'test',
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
          maxExecutionTime: 5000,
          preferredServers: [],
          reasoningVerbosity: 'verbose',
          interruptOnError: true,
        },
        sessionId: 'test-session',
      };

      const alternatives = reasoningModule.generateAlternatives('approach for task', context);

      expect(alternatives).toBeDefined();
      expect(alternatives.length).toBe(2);
      expect(alternatives[0].description).toContain('Direct approach');
      expect(alternatives[1].description).toContain('Comprehensive approach');
    });
  });

  describe('formatReasoningForUI', () => {
    const testEntry: ReasoningEntry = {
      id: 'test-id',
      type: 'decision',
      content: 'Decision: Select approach\n\nAlternatives considered:\n→ Option A\n  Option B',
      alternatives: [
        {
          id: 'a',
          description: 'Option A',
          pros: ['Fast', 'Simple'],
          cons: ['Less flexible'],
          feasibility: 0.8,
        },
        {
          id: 'b',
          description: 'Option B',
          pros: ['Flexible', 'Robust'],
          cons: ['Slower', 'Complex'],
          feasibility: 0.6,
        },
      ],
      selectedOption: 'a',
      confidence: 0.75,
      timestamp: new Date(),
    };

    it('should format reasoning in verbose mode', () => {
      const formatted = reasoningModule.formatReasoningForUI(testEntry, 'verbose');

      expect(formatted).toContain('Decision: Select approach');
      expect(formatted).toContain('Confidence: 75%');
      expect(formatted).toContain('Alternatives Analysis:');
      expect(formatted).toContain('Option A');
      expect(formatted).toContain('Pros: Fast, Simple');
    });

    it('should format reasoning in concise mode', () => {
      const formatted = reasoningModule.formatReasoningForUI(testEntry, 'concise');

      expect(formatted).toBe('Decision: Selected Option A');
    });

    it('should return empty string in hidden mode', () => {
      const formatted = reasoningModule.formatReasoningForUI(testEntry, 'hidden');

      expect(formatted).toBe('');
    });
  });

  describe('history management', () => {
    it('should track reasoning history', () => {
      reasoningModule.createPlanningReasoning('Objective 1', []);
      reasoningModule.createEvaluationReasoning('Eval 1', {}, 0.8);

      const history = reasoningModule.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe('planning');
      expect(history[1].type).toBe('evaluation');
    });

    it('should limit history when requested', () => {
      for (let i = 0; i < 5; i++) {
        reasoningModule.createEvaluationReasoning(`Eval ${i}`, {}, 0.8);
      }

      const limitedHistory = reasoningModule.getHistory(3);
      expect(limitedHistory).toHaveLength(3);
    });

    it('should clear history', () => {
      reasoningModule.createPlanningReasoning('Objective 1', []);
      reasoningModule.clearHistory();

      const history = reasoningModule.getHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      reasoningModule.updateConfig({
        verbosityLevel: 'concise',
        maxAlternatives: 10,
      });

      const config = reasoningModule.getConfig();
      expect(config.verbosityLevel).toBe('concise');
      expect(config.maxAlternatives).toBe(10);
      expect(config.minConfidenceThreshold).toBe(0.6); // unchanged
    });
  });
});
