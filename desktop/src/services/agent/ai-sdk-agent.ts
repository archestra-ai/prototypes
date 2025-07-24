import { Agent, run, tool } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions';

import {
  AgentContext,
  AgentError,
  AgentErrorCode,
  AgentState,
  Alternative,
  ArchestraAgentConfig,
  EnvironmentState,
  ReasoningEntry,
  TaskProgress,
  TaskStep,
  UserPreferences,
} from '../../types/agent';
import { MemoryManager } from './memory-manager';
import { ModelCapabilities, ModelProviderFactory } from './model-provider';
import { ReasoningConfig, ReasoningContext, ReasoningModule } from './reasoning-module';

// Enable debug logging for OpenAI Agents SDK
// const logger = getLogger('openai-agents:archestra');
// logger.enabled = true; // Note: Logger might not have an 'enabled' property

/**
 * ArchestraAgent implementation using Vercel AI SDK
 * Supports both OpenAI and Ollama models through the AI SDK adapter
 */
export class ArchestraAgent {
  private agent: Agent;
  private config: ArchestraAgentConfig;
  private state: AgentState;
  private abortController: AbortController | null = null;
  private mcpTools: ReturnType<typeof tool>[] = [];
  private memoryManager: MemoryManager;
  private reasoningModule: ReasoningModule;
  private modelProvider: string;
  private supportsTools: boolean;

  constructor(config: ArchestraAgentConfig) {
    this.config = config;

    const sessionId = crypto.randomUUID();

    // Initialize memory manager
    this.memoryManager = new MemoryManager(sessionId, config.memoryConfig);

    // Initialize reasoning module
    const reasoningConfig: ReasoningConfig = {
      maxAlternatives: 5,
      minConfidenceThreshold: 0.6,
      verbosityLevel: config.reasoningMode || 'verbose',
      enableExplanations: true,
    };
    this.reasoningModule = new ReasoningModule(reasoningConfig);

    // Initialize default state
    this.state = {
      mode: 'idle',
      progress: { completed: 0, total: 0, currentStep: null },
      reasoning: [],
      workingMemory: this.memoryManager.exportMemory(),
    };

    // Determine model provider and capabilities
    const modelName = config.model || 'gpt-4o';
    this.modelProvider = ModelCapabilities.getProviderName(modelName);
    this.supportsTools = ModelCapabilities.supportsTools(modelName);

    // MCP tools are already in SDK format from the wrapper
    // Only use tools if the model supports them
    this.mcpTools = this.supportsTools ? config.mcpTools : [];

    // Create AI model using the appropriate provider
    const provider = ModelProviderFactory.create(modelName);
    const aiModel = provider.createModel(modelName);

    console.log('🎯 [ArchestraAgent] Creating AI SDK adapter:', {
      modelName,
      providerType: provider.getProviderName(),
      aiModelType: typeof aiModel,
      aiModelKeys: Object.keys(aiModel || {}),
    });

    // Log Ollama-specific details if it's an Ollama model
    if (provider.getProviderName() === 'ollama') {
      console.log('🦙 [ArchestraAgent] Ollama model details:', {
        provider: aiModel?.provider,
        modelId: aiModel?.modelId,
        hasDoGenerate: typeof aiModel?.doGenerate === 'function',
        hasDoStream: typeof aiModel?.doStream === 'function',
      });
    }

    const adaptedModel = aisdk(aiModel);

    console.log('✅ [ArchestraAgent] AI SDK adapter created:', {
      adaptedModelType: typeof adaptedModel,
      adaptedModelKeys: Object.keys(adaptedModel || {}),
      isValidModel: adaptedModel && typeof adaptedModel === 'object',
    });

    // Configure Agent using AI SDK adapter
    try {
      console.log('🏗️ [ArchestraAgent] Creating Agent instance with:', {
        name: 'ArchestraAgent',
        instructionsLength: this.buildInstructions(config).length,
        toolsCount: this.mcpTools.length,
        hasModel: !!adaptedModel,
      });

      this.agent = new Agent({
        name: 'ArchestraAgent',
        instructions: this.buildInstructions(config),
        tools: this.supportsTools ? this.mcpTools : [],
        model: adaptedModel,
      });

      console.log('✅ [ArchestraAgent] Agent instance created successfully');
    } catch (error) {
      console.error('❌ [ArchestraAgent] Failed to create Agent instance:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });
      }
      throw error;
    }

    // Log initialization details
    console.log(`🤖 Agent initialized with:`, {
      model: modelName,
      provider: this.modelProvider,
      supportsTools: this.supportsTools,
      toolCount: this.mcpTools.length,
    });
  }

  private buildInstructions(config: ArchestraAgentConfig): string {
    const baseInstructions = `You are an autonomous AI agent operating within the Archestra desktop application.
Your role is to help users complete complex tasks by breaking them down into manageable steps and executing them systematically.

Key behaviors:
1. Always create a clear plan before executing tasks
2. ${this.supportsTools ? 'Use available MCP tools intelligently to accomplish objectives' : 'Since this model does not support tools, provide detailed step-by-step instructions that the user can follow'}
3. Maintain context in working memory throughout execution
4. Provide transparent reasoning for decisions
5. Adapt plans when steps fail or new information emerges
6. ${this.supportsTools ? 'Request user intervention only when necessary' : 'Clearly explain what actions the user should take to accomplish each step'}

Current model: ${config.model || 'gpt-4o'} (Provider: ${this.modelProvider})
${!this.supportsTools ? '\nIMPORTANT: This model does not support tool calling. I will provide detailed instructions and guidance instead of directly executing actions. Please follow the steps I outline to accomplish your objective.' : ''}

When working without tools:
- Break down tasks into clear, actionable steps
- Provide specific commands or actions the user should take
- Explain the expected outcomes of each step
- Offer troubleshooting advice if something might go wrong
- Maintain a helpful and instructive tone

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
      this.memoryManager.addEntry(
        'observation',
        `Model: ${this.config.model}, Provider: ${this.modelProvider}, Tools available: ${this.supportsTools ? 'Yes' : 'No'}`
      );

      if (this.supportsTools) {
        this.memoryManager.addEntry('observation', `Available tools: ${this.mcpTools.length} tools configured`);
      }

      // Initialize the agent with the objective
      this.updateState({ mode: 'planning' });

      // Use SDK's run function for execution with streaming
      console.log('🚀 [ArchestraAgent] Calling SDK run function with:', {
        objective,
        stream: true,
        maxTurns: this.config.maxSteps || 10,
        hasSignal: !!this.abortController?.signal,
        contextKeys: Object.keys(fullContext),
      });

      let streamResult;
      try {
        streamResult = await run(this.agent, objective, {
          stream: true,
          context: fullContext,
          maxTurns: this.config.maxSteps || 10,
          signal: this.abortController.signal,
        });

        console.log('📦 [ArchestraAgent] SDK run returned:', {
          resultType: typeof streamResult,
          hasToStream: streamResult && typeof (streamResult as any).toStream === 'function',
          resultKeys: streamResult ? Object.keys(streamResult) : [],
        });
      } catch (runError) {
        console.error('💥 [ArchestraAgent] SDK run function failed:', runError);
        if (runError instanceof Error) {
          console.error('Run error details:', {
            message: runError.message,
            stack: runError.stack,
            name: runError.name,
            // Check if it's an API error
            response: (runError as any).response,
            status: (runError as any).status,
            statusText: (runError as any).statusText,
          });
        }
        throw runError;
      }

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

  // Reasoning module methods
  createPlanningReasoning(objective: string, steps: TaskStep[]): ReasoningEntry {
    const entry = this.reasoningModule.createPlanningReasoning(objective, steps);
    this.addReasoningEntry(entry);
    return entry;
  }

  createDecisionReasoning(
    decision: string,
    alternatives: Alternative[],
    selectedOptionId: string,
    context?: Partial<ReasoningContext>
  ): ReasoningEntry {
    const fullContext: ReasoningContext = {
      objective: this.state.currentTask || '',
      currentState: this.state.mode,
      availableResources: this.mcpTools.map((t) => t.name),
      constraints: [],
      previousDecisions: this.state.reasoning.filter((r) => r.type === 'decision'),
      ...context,
    };

    const entry = this.reasoningModule.createDecisionReasoning(decision, alternatives, selectedOptionId, fullContext);
    this.addReasoningEntry(entry);
    return entry;
  }

  createEvaluationReasoning(evaluation: string, metrics: Record<string, any>, confidence: number): ReasoningEntry {
    const entry = this.reasoningModule.createEvaluationReasoning(evaluation, metrics, confidence);
    this.addReasoningEntry(entry);
    return entry;
  }

  createAdaptationReasoning(
    reason: string,
    originalPlan: string,
    adaptedPlan: string,
    triggerEvent: string
  ): ReasoningEntry {
    const entry = this.reasoningModule.createAdaptationReasoning(reason, originalPlan, adaptedPlan, triggerEvent);
    this.addReasoningEntry(entry);
    return entry;
  }

  generateAlternatives(decision: string, maxAlternatives?: number): Alternative[] {
    const context: AgentContext = {
      objective: this.state.currentTask || '',
      availableTools: [], // Tools are managed by SDK
      workingMemory: this.memoryManager.exportMemory(),
      environmentState: this.getDefaultEnvironmentState(),
      userPreferences: this.getDefaultUserPreferences(),
      sessionId: this.state.workingMemory.agentSessionId,
    };

    return this.reasoningModule.generateAlternatives(decision, context, maxAlternatives);
  }

  formatReasoningForUI(entry: ReasoningEntry, mode?: 'verbose' | 'concise' | 'hidden'): string {
    return this.reasoningModule.formatReasoningForUI(entry, mode || this.config.reasoningMode || 'verbose');
  }

  getReasoningHistory(limit?: number): ReasoningEntry[] {
    return this.reasoningModule.getHistory(limit);
  }

  updateReasoningConfig(config: Partial<ReasoningConfig>): void {
    this.reasoningModule.updateConfig(config);
  }

  private handleExecutionError(error: any): void {
    let agentError: AgentError;

    if (error instanceof AgentError) {
      agentError = error;
    } else {
      // Check if it's a provider-specific error
      const errorMessage = error.message || 'Unknown error occurred';
      let errorCode = AgentErrorCode.INITIALIZATION_FAILED;
      let suggestedAction: string | undefined;

      if (errorMessage.includes('model') && errorMessage.includes('not found')) {
        errorCode = AgentErrorCode.INITIALIZATION_FAILED;
        suggestedAction = `Model '${this.config.model}' not found. Please check if it's installed or use a different model.`;
      } else if (errorMessage.includes('tool') && !this.supportsTools) {
        errorCode = AgentErrorCode.TOOL_SELECTION_FAILED;
        suggestedAction = `Model '${this.config.model}' does not support tools. Consider using a different model for tool-based tasks.`;
      }

      agentError = new AgentError(errorMessage, errorCode, false, suggestedAction);
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
