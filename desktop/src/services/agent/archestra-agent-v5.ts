import type { LanguageModel, Tool } from 'ai';
import { streamText } from 'ai';

import {
  AgentContext,
  AgentError,
  AgentErrorCode,
  AgentState,
  ArchestraAgentConfig,
  ReasoningEntry,
  TaskProgress,
  TaskProgressDataPart,
} from '@/types/agent';

import { MemoryManager } from './memory-manager';
import { ModelCapabilities, ModelProviderFactory } from './model-provider';
import { ReasoningConfig, ReasoningModule } from './reasoning-module';

/**
 * ArchestraAgentV5 - Pure AI SDK v5 implementation with proper message handling
 * Leverages streamText with SSE streaming and enhanced tool features
 */
export class ArchestraAgentV5 {
  private config: ArchestraAgentConfig;
  private state: AgentState;
  private abortController: AbortController | null = null;
  private tools: Record<string, Tool> = {};
  private aiModel: LanguageModel;
  private memoryManager: MemoryManager;
  private reasoningModule: ReasoningModule;
  private modelProvider: string;
  private supportsTools: boolean;
  public readonly id: string;

  constructor(config: ArchestraAgentConfig) {
    this.config = config;
    this.id = crypto.randomUUID();

    // Initialize memory manager
    this.memoryManager = new MemoryManager(this.id, config.memoryConfig);

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
      reasoningText: [],
      workingMemory: this.memoryManager.exportMemory(),
    };

    // Determine model provider and capabilities
    const modelName = config.model || 'llama3.2';
    this.modelProvider = ModelCapabilities.getProviderName(modelName);
    this.supportsTools = ModelCapabilities.supportsTools(modelName);

    // Create AI model using the appropriate provider
    const provider = ModelProviderFactory.create(modelName);
    this.aiModel = provider.createModel(modelName);

    console.log('🚀 [ArchestraAgentV5] Creating v5 native agent:', {
      id: this.id,
      modelName,
      providerType: provider.getProviderName(),
      supportsTools: this.supportsTools,
      toolCount: Array.isArray(config.mcpTools) ? config.mcpTools.length : Object.keys(config.mcpTools || {}).length,
    });

    // Store tools directly if model supports tools
    this.tools = {};
    if (this.supportsTools && config.mcpTools) {
      if (Array.isArray(config.mcpTools)) {
        // Legacy: Convert array to Record<string, Tool>
        config.mcpTools.forEach((tool, index) => {
          const toolName = `tool_${index}`;
          this.tools[toolName] = tool;
        });
      } else if (typeof config.mcpTools === 'object') {
        // Native AI SDK: mcpTools is already a Record<string, Tool>
        this.tools = config.mcpTools;
      }
      console.log('🔧 [ArchestraAgentV5] Loaded AI SDK tools:', Object.keys(this.tools));
    }
  }

  /**
   * Execute the agent with v5 streamText
   */
  async execute(objective: string, context: AgentContext) {
    try {
      this.updateState({ mode: 'initializing' });
      this.abortController = new AbortController();

      // Create initial planning reasoning
      const planningReasoning = this.reasoningModule.createPlanningReasoning(objective, []);
      this.addReasoningEntry(planningReasoning);

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(context);

      // Memory context
      const memoryContext = this.memoryManager.getContext();

      this.updateState({ mode: 'executing', currentTask: objective });

      console.log('🎯 [ArchestraAgentV5] Starting v5 execution:', {
        objective,
        systemPrompt: systemPrompt.substring(0, 200) + '...',
        memoryContext: memoryContext.substring(0, 100) + '...',
        toolsEnabled: this.supportsTools,
        toolCount: Object.keys(this.tools).length,
        toolNames: Object.keys(this.tools),
      });

      // Use v5 streamText with proper configuration
      const result = await streamText({
        model: this.aiModel,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: objective,
          },
        ],
        tools: this.supportsTools ? this.tools : undefined,
        experimental_telemetry: { isEnabled: true },
        maxSteps: this.config.maxSteps || 10, // Allow multiple steps for tool execution
        onStepFinish: async (step) => {
          console.log('📍 [ArchestraAgentV5] Step finished:', {
            text: step.text?.substring(0, 100),
            toolCalls: step.toolCalls?.map((tc) => ({ id: tc.toolCallId, name: tc.toolName })),
            toolResults: step.toolResults?.map((tr) => ({ id: tr.toolCallId, name: tr.toolName })),
            finishReason: step.finishReason,
          });

          // Update task progress
          await this.updateTaskProgress(step);

          // Add memory entries for tool executions
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const toolCall of step.toolCalls) {
              this.memoryManager.addEntry('observation', `Tool called: ${toolCall.toolName}`, {
                toolId: toolCall.toolCallId,
                args: toolCall.input,
              });
            }
          }

          // Create decision reasoning for tool selection
          if (step.toolCalls && step.toolCalls.length > 0) {
            // Use empty alternatives for now - could be enhanced later
            const decisionReasoning = this.reasoningModule.createDecisionReasoning(
              'Tool selection',
              [],
              '0', // First tool selected (as string)
              {
                objective,
                currentState: 'Executing tool calls',
                availableResources: Object.keys(this.tools),
                constraints: [],
                previousDecisions: this.state.reasoningText,
              }
            );
            this.addReasoningEntry(decisionReasoning);
          }
        },
        abortSignal: this.abortController.signal,
      });

      console.log('📦 [ArchestraAgentV5] Stream created, returning stream result');

      // Return the stream result directly - it's already in the correct format
      return result;
    } catch (error) {
      this.handleExecutionError(error);
      throw error;
    }
  }

  /**
   * Update task progress from step data
   */
  private async updateTaskProgress(step: any) {
    const currentProgress = this.state.progress;
    const updatedProgress: TaskProgress = {
      completed: currentProgress.completed + 1,
      total: this.config.maxSteps || 10,
      currentStep: step.text?.substring(0, 50) || 'Processing...',
      percentComplete: Math.round(((currentProgress.completed + 1) / (this.config.maxSteps || 10)) * 100),
      estimatedTimeRemaining: undefined, // Could calculate based on step timing
    };

    this.updateProgress(updatedProgress);

    // Stream task progress as data part
    return {
      type: 'data',
      data: {
        type: 'task-progress',
        progress: updatedProgress,
      },
    } as TaskProgressDataPart;
  }

  /**
   * Build system prompt with v5 enhancements
   */
  private buildSystemPrompt(_context: AgentContext): string {
    const baseInstructions = `You are an autonomous AI agent with enhanced v5 capabilities.
Your role is to help users complete complex tasks efficiently and transparently.

Key behaviors:
1. Stream your reasoning process in real-time for transparency
2. ${this.supportsTools ? 'Use tools intelligently with proper error handling' : 'Provide detailed instructions since tools are not available'}
3. Maintain context throughout the conversation
4. Adapt dynamically based on results and user feedback
5. Provide structured updates on task progress

Model: ${this.config.model || 'llama3.2'} (${this.modelProvider})
Reasoning Mode: ${this.config.reasoningMode || 'verbose'}

${this.supportsTools ? `Available tools: ${Object.keys(this.tools).join(', ')}` : 'Tool calling not supported - provide detailed guidance instead'}

${this.config.customInstructions ? `\nInstructions:\n${this.config.customInstructions}` : ''}
${this.config.systemPrompt ? `\nContext:\n${this.config.systemPrompt}` : ''}`;

    return baseInstructions;
  }

  /**
   * Add reasoning entry and potentially stream it
   */
  private addReasoningEntry(entry: ReasoningEntry) {
    this.state.reasoningText.push(entry);

    // In a real implementation, reasoning would be streamed through the response
    // as a ReasoningDataPart: { type: 'data', data: { type: 'reasoning', entry } }

    console.log('🧠 [ArchestraAgentV5] Reasoning added:', {
      type: entry.type,
      confidence: entry.confidence,
      content: entry.content.substring(0, 100),
    });
  }

  /**
   * Handle execution errors with proper recovery
   */
  private handleExecutionError(error: any) {
    console.error('❌ [ArchestraAgentV5] Execution error:', error);

    let agentError: AgentError;

    if (error.name === 'AbortError') {
      agentError = new AgentError(
        'Agent execution was cancelled',
        AgentErrorCode.USER_INTERVENTION_REQUIRED,
        true,
        'Resume or restart the agent'
      );
    } else if (error.message?.includes('model')) {
      agentError = new AgentError(
        'Model error occurred',
        AgentErrorCode.TOOL_EXECUTION_FAILED,
        true,
        'Check model availability and configuration'
      );
    } else {
      agentError = new AgentError(error.message || 'Unknown error occurred', AgentErrorCode.PLANNING_FAILED, false);
    }

    this.updateState({ mode: 'idle' });

    // Create evaluation reasoning for the error
    const errorReasoning = this.reasoningModule.createEvaluationReasoning(
      'Execution failed: ' + agentError.message,
      { errorCode: agentError.code, recoverable: agentError.recoverable },
      0.5 // Medium confidence for error evaluation
    );
    this.addReasoningEntry(errorReasoning);
  }

  // State management methods
  private updateState(updates: Partial<AgentState>) {
    this.state = { ...this.state, ...updates };
  }

  private updateProgress(updates: Partial<TaskProgress>) {
    this.state.progress = { ...this.state.progress, ...updates };
  }

  // Public interface methods
  pause(): void {
    if (this.state.mode !== 'executing') {
      throw new AgentError('Agent is not currently executing', AgentErrorCode.INITIALIZATION_FAILED, false);
    }

    this.updateState({ mode: 'paused' });
    this.abortController?.abort();
  }

  resume(): void {
    if (this.state.mode !== 'paused') {
      throw new AgentError('Agent is not paused', AgentErrorCode.INITIALIZATION_FAILED, false);
    }

    this.updateState({ mode: 'executing' });
    // In v5, resuming would require re-establishing the stream
  }

  stop(): void {
    this.updateState({ mode: 'idle' });
    this.abortController?.abort();
    this.abortController = null;
  }

  getState(): AgentState {
    return { ...this.state };
  }

  get model(): string {
    return this.config.model || 'llama3.2';
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

  formatReasoningForUI(entry: ReasoningEntry, mode?: 'verbose' | 'concise' | 'hidden'): string {
    return this.reasoningModule.formatReasoningForUI(entry, mode || this.config.reasoningMode || 'verbose');
  }

  getReasoningHistory(limit?: number): ReasoningEntry[] {
    return this.reasoningModule.getHistory(limit);
  }

  updateReasoningConfig(config: Partial<ReasoningConfig>): void {
    this.reasoningModule.updateConfig(config);
  }

  /**
   * Execute the agent's objective with a streaming response
   */
  async executeObjective(objective: string, context?: AgentContext) {
    // For backward compatibility, create a context if not provided
    const agentContext = context || {
      objective,
      availableTools: Object.keys(this.tools).map((name) => ({
        name,
        serverName: 'unknown',
        description: 'Tool available for execution',
        capabilities: [],
        performance: { averageLatency: 100, successRate: 0.95 },
        requiresPermission: false,
      })),
      workingMemory: this.memoryManager.exportMemory(),
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
        reasoningVerbosity: this.config.reasoningMode || 'verbose',
        interruptOnError: true,
      },
      sessionId: crypto.randomUUID(),
    };

    return this.execute(objective, agentContext);
  }
}
