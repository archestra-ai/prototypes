import { Agent, run, tool } from '@openai/agents';

import {
  AgentContext,
  AgentError,
  AgentErrorCode,
  AgentState,
  ArchestraAgentConfig,
  EnvironmentState,
  ReasoningEntry,
  TaskProgress,
  UserPreferences,
} from '../../types/agent';
import { MemoryManager } from './memory-manager';

export class ArchestraAgent {
  private agent: Agent;
  private config: ArchestraAgentConfig;
  private state: AgentState;
  private abortController: AbortController | null = null;
  private mcpTools: ReturnType<typeof tool>[] = [];
  private memoryManager: MemoryManager;

  constructor(config: ArchestraAgentConfig) {
    this.config = config;

    const sessionId = crypto.randomUUID();

    // Initialize memory manager
    this.memoryManager = new MemoryManager(sessionId, config.memoryConfig);

    // Initialize default state
    this.state = {
      mode: 'idle',
      progress: { completed: 0, total: 0, currentStep: null },
      reasoning: [],
      workingMemory: this.memoryManager.exportMemory(),
    };

    // MCP tools are already in SDK format from the wrapper
    this.mcpTools = config.mcpTools;

    // Configure OpenAI Agent using SDK format
    this.agent = new Agent({
      name: 'ArchestraAgent',
      instructions: this.buildInstructions(config),
      tools: this.mcpTools,
      // Model will be specified in run() call to allow flexibility
    });
  }

  private buildInstructions(config: ArchestraAgentConfig): string {
    const baseInstructions = `You are an autonomous AI agent operating within the Archestra desktop application.
Your role is to help users complete complex tasks by breaking them down into manageable steps and executing them systematically.

Key behaviors:
1. Always create a clear plan before executing tasks
2. Use available MCP tools intelligently to accomplish objectives
3. Maintain context in working memory throughout execution
4. Provide transparent reasoning for decisions
5. Adapt plans when steps fail or new information emerges
6. Request user intervention only when necessary

${config.customInstructions ? `\nAdditional instructions:\n${config.customInstructions}` : ''}

${config.systemPrompt ? `\nSystem context:\n${config.systemPrompt}` : ''}`;

    return baseInstructions;
  }

  async executeObjective(objective: string, context?: Partial<AgentContext>): Promise<any> {
    if (this.state.mode !== 'idle') {
      throw new AgentError(
        'Agent is already executing a task',
        AgentErrorCode.INITIALIZATION_FAILED,
        false,
        'Wait for the current task to complete or stop the agent'
      );
    }

    try {
      this.abortController = new AbortController();
      this.updateState({ mode: 'initializing', currentTask: objective });

      // Build full context
      const fullContext: AgentContext = {
        objective,
        availableTools: [], // Tools are now handled by SDK internally
        workingMemory: this.memoryManager.exportMemory(),
        environmentState: context?.environmentState || this.getDefaultEnvironmentState(),
        userPreferences: context?.userPreferences || this.getDefaultUserPreferences(),
        sessionId: this.state.workingMemory.agentSessionId,
      };

      // Add context to memory for agent to reference
      this.memoryManager.addEntry('observation', `Starting task: ${objective}`);
      this.memoryManager.addEntry('observation', `Available tools: ${this.mcpTools.length} tools configured`);

      // Initialize the agent with the objective
      this.updateState({ mode: 'planning' });

      // Use SDK's run function for execution with streaming
      const streamResult = await run(this.agent, objective, {
        stream: true,
        context: fullContext,
        maxTurns: this.config.maxSteps || 10,
        signal: this.abortController.signal,
      });

      // Return the stream for the store to handle
      return streamResult;
    } catch (error) {
      this.handleExecutionError(error);
      throw error;
    }
  }

  // Handle run state for serialization and recovery
  async saveRunState(runState: any): Promise<void> {
    this.updateState({ runState });
    // This can be used to persist state for recovery
  }

  async loadRunState(): Promise<any | undefined> {
    return this.state.runState;
  }

  // Get current model for display/debugging
  get model(): string {
    return this.config.model || 'gpt-4o';
  }

  // Process streaming events (called by the store's event handler)
  processStreamEvent(event: any): void {
    switch (event.type) {
      case 'agent_updated_stream_event':
        // Handle agent handoffs
        this.updateState({ currentAgent: event.agent?.name });
        break;
      case 'item_stream_event':
        // Handle execution updates
        if (event.item?.type === 'tool_call') {
          this.memoryManager.addEntry('observation', `Tool called: ${event.item.name}`);
        }
        break;
      case 'raw_model_stream_event':
        // Handle model streaming
        if (event.delta?.content) {
          this.updateState({ streamingContent: event.delta.content });
        }
        break;
    }
  }

  pause(): void {
    if (this.state.mode !== 'executing') {
      throw new AgentError('Agent is not currently executing', AgentErrorCode.INITIALIZATION_FAILED, false);
    }

    this.updateState({ mode: 'paused' });
    this.abortController?.abort();
  }

  async resume(): Promise<any> {
    if (this.state.mode !== 'paused') {
      throw new AgentError('Agent is not paused', AgentErrorCode.INITIALIZATION_FAILED, false);
    }

    this.abortController = new AbortController();
    this.updateState({ mode: 'executing' });

    // Resume execution using saved RunState if available
    if (this.state.runState && this.state.currentTask) {
      return await run(this.agent, this.state.currentTask, {
        stream: true,
        maxTurns: this.config.maxSteps || 10,
        signal: this.abortController.signal,
        // Resume functionality would need to be implemented based on SDK support
      });
    }

    return null;
  }

  stop(): void {
    this.abortController?.abort();
    this.updateState({ mode: 'idle', currentTask: undefined, plan: undefined });
    this.cleanup();
  }

  getState(): AgentState {
    return { ...this.state };
  }

  private updateState(updates: Partial<AgentState>): void {
    this.state = { ...this.state, ...updates };
    // Emit state change event (will be connected to store)
  }

  updateProgress(updates: Partial<TaskProgress>): void {
    this.state.progress = { ...this.state.progress, ...updates };

    if (this.state.plan) {
      const percentComplete = (this.state.progress.completed / this.state.plan.steps.length) * 100;
      this.state.progress.percentComplete = percentComplete;
    }
  }

  addReasoningEntry(entry: ReasoningEntry): void {
    this.state.reasoning.push(entry);

    // Limit reasoning entries to prevent memory issues
    const maxEntries = 100;
    if (this.state.reasoning.length > maxEntries) {
      this.state.reasoning = this.state.reasoning.slice(-maxEntries);
    }
  }

  private handleExecutionError(error: any): void {
    let agentError: AgentError;

    if (error instanceof AgentError) {
      agentError = error;
    } else {
      agentError = new AgentError(
        error.message || 'Unknown error occurred',
        AgentErrorCode.INITIALIZATION_FAILED,
        false
      );
    }

    this.updateState({ mode: 'idle' });
    throw agentError;
  }

  private getDefaultEnvironmentState(): EnvironmentState {
    return {
      availableServers: [], // Server info managed by MCP store
      activeConnections: 0,
      resourceUsage: {
        memory: 0,
        cpu: 0,
      },
      timestamp: new Date(),
    };
  }

  private getDefaultUserPreferences(): UserPreferences {
    return {
      autoApproveTools: [],
      maxExecutionTime: 300000, // 5 minutes
      preferredServers: [],
      reasoningVerbosity: 'verbose',
      interruptOnError: true,
    };
  }

  cleanup(): void {
    this.abortController?.abort();
    this.abortController = null;
    // Additional cleanup logic
  }

  // Memory management methods (delegates to MemoryManager)
  addMemoryEntry(
    type: 'observation' | 'decision' | 'result' | 'error',
    content: string,
    metadata?: Record<string, any>
  ): void {
    this.memoryManager.addEntry(type, content, metadata);
    // Update state with latest memory export
    this.state.workingMemory = this.memoryManager.exportMemory();
  }

  getMemoryContext(): string {
    return this.memoryManager.getContext();
  }

  async summarizeMemory(): Promise<string> {
    const summary = await this.memoryManager.summarizeMemory();
    // Update state with latest memory export
    this.state.workingMemory = this.memoryManager.exportMemory();
    return summary;
  }

  searchMemory(criteria: Parameters<MemoryManager['searchMemories']>[0]) {
    return this.memoryManager.searchMemories(criteria);
  }

  getMemoryStatistics() {
    return this.memoryManager.getStatistics();
  }

  getRelatedMemories(entryId: string, limit?: number) {
    return this.memoryManager.getRelatedMemories(entryId, limit);
  }

  // Export memory for state management
  exportMemory() {
    return this.memoryManager.exportMemory();
  }
}
