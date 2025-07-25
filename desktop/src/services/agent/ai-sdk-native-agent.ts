import type { LanguageModel, Tool } from 'ai';
import { stepCountIs, streamText, tool } from 'ai';

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
  UserPreferences,
} from '../../types/agent';
import { MemoryManager } from './memory-manager';
import { ModelCapabilities, ModelProviderFactory } from './model-provider';
import { ReasoningConfig, ReasoningContext, ReasoningModule } from './reasoning-module';

/**
 * ArchestraAgent implementation using Vercel AI SDK directly
 * No adapter layer - direct integration with AI SDK
 */
export class ArchestraAgentNative {
  private config: ArchestraAgentConfig;
  private state: AgentState;
  private abortController: AbortController | null = null;
  private tools: Record<string, Tool> = {};
  private aiModel: LanguageModel;
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
      reasoningText: [],
      workingMemory: this.memoryManager.exportMemory(),
    };

    // Determine model provider and capabilities
    const modelName = config.model || 'gpt-4o';
    this.modelProvider = ModelCapabilities.getProviderName(modelName);
    this.supportsTools = ModelCapabilities.supportsTools(modelName);

    // Create AI model using the appropriate provider
    const provider = ModelProviderFactory.create(modelName);
    this.aiModel = provider.createModel(modelName);

    console.log('🎯 [ArchestraAgentNative] Creating native AI SDK agent:', {
      modelName,
      providerType: provider.getProviderName(),
      supportsTools: this.supportsTools,
      toolCount: Array.isArray(config.mcpTools) ? config.mcpTools.length : Object.keys(config.mcpTools || {}).length,
    });

    // Store tools directly if model supports tools
    this.tools = {};
    if (this.supportsTools && config.mcpTools) {
      if (Array.isArray(config.mcpTools)) {
        // Legacy: If mcpTools is an array, convert it
        this.tools = this.convertMCPToolsToAISDK(config.mcpTools);
      } else if (typeof config.mcpTools === 'object') {
        // Native AI SDK: mcpTools is already a Record<string, Tool>
        this.tools = config.mcpTools;
      }
      console.log('🔧 [ArchestraAgentNative] Loaded AI SDK tools:', Object.keys(this.tools));
    }

    // Log initialization details
    console.log(`🤖 Agent initialized with:`, {
      model: modelName,
      provider: this.modelProvider,
      supportsTools: this.supportsTools,
      toolCount: Object.keys(this.tools).length,
    });
  }

  /**
   * Convert MCP tools from OpenAI SDK format to Vercel AI SDK format
   */
  private convertMCPToolsToAISDK(mcpTools: any[]): Record<string, Tool> {
    const tools: Record<string, Tool> = {};

    for (const mcpTool of mcpTools) {
      // Extract the actual tool configuration
      const toolConfig = mcpTool._config || mcpTool;
      const toolName = toolConfig.name || mcpTool.name;

      if (!toolName) {
        console.warn('⚠️ [ArchestraAgentNative] Skipping tool without name:', mcpTool);
        continue;
      }

      console.log('🔄 [ArchestraAgentNative] Converting tool:', {
        name: toolName,
        hasDescription: !!toolConfig.description,
        hasParameters: !!toolConfig.parameters,
        hasExecute: !!toolConfig.execute,
      });

      // Create AI SDK tool
      tools[toolName] = tool({
        description: toolConfig.description || `Execute ${toolName}`,
        inputSchema: toolConfig.parameters || {},
        execute:
          toolConfig.execute ||
          (async (_args) => {
            console.warn(`⚠️ [ArchestraAgentNative] No execute function for tool ${toolName}`);
            return { error: 'Tool execution not implemented' };
          }),
      });
    }

    return tools;
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
        availableTools: Object.keys(this.tools).map((name) => ({
          name,
          serverName: 'unknown', // This could be extracted from the tool name if needed
          capabilities: [],
          performance: {
            averageLatency: 0,
            successRate: 1,
          },
          requiresPermission: false,
        })),
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
        this.memoryManager.addEntry(
          'observation',
          `Available tools: ${Object.keys(this.tools).length} tools configured`
        );
      }

      // Initialize the agent with the objective
      this.updateState({ mode: 'planning' });

      // Build the system prompt with context
      const systemPrompt = this.buildSystemPrompt(fullContext);

      console.log('🚀 [ArchestraAgentNative] Using Vercel AI SDK streamText with:', {
        objective,
        maxSteps: this.config.maxSteps || 10,
        hasTools: Object.keys(this.tools).length > 0,
        toolNames: Object.keys(this.tools),
      });

      // Use Vercel AI SDK's streamText for multi-step agent execution
      const streamResult = streamText({
        model: this.aiModel,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: objective,
          },
        ],
        tools: this.supportsTools ? this.tools : undefined,
        stopWhen: stepCountIs(this.config.maxSteps || 10),
        abortSignal: this.abortController.signal,
        onStepFinish: ({ text, toolCalls, toolResults, finishReason }) => {
          console.log('📍 [ArchestraAgentNative] Step finished:', {
            hasText: !!text,
            toolCallCount: toolCalls?.length || 0,
            toolResultCount: toolResults?.length || 0,
            finishReason,
          });

          // Update progress
          if (this.state.plan) {
            this.updateProgress({
              completed: this.state.progress.completed + 1,
            });
          }

          // Log tool executions
          if (toolCalls && toolCalls.length > 0) {
            for (const toolCall of toolCalls) {
              this.memoryManager.addEntry('observation', `Tool called: ${toolCall.toolName}`);
            }
          }
        },
      });

      console.log('📦 [ArchestraAgentNative] Stream created, returning for processing', {
        streamResultKeys: Object.keys(streamResult),
        hasFullStream: 'fullStream' in streamResult,
        hasTextStream: 'textStream' in streamResult,
        hasToDataStream: typeof (streamResult as any).toDataStream === 'function',
      });

      // Use the fullStream which includes all events (tool calls, text, etc.)
      // instead of just the textStream
      if ('fullStream' in streamResult) {
        return (streamResult as any).fullStream;
      }

      // Fallback to wrapping the text stream if fullStream is not available
      const eventStream = this.wrapTextStream((streamResult as any).textStream);

      return eventStream;
    } catch (error) {
      this.handleExecutionError(error);
      throw error;
    }
  }

  private buildSystemPrompt(context: AgentContext): string {
    const baseInstructions = `You are an autonomous AI agent operating within the Archestra desktop application.
Your role is to help users complete complex tasks by breaking them down into manageable steps and executing them systematically.

Key behaviors:
1. Always create a clear plan before executing tasks
2. ${this.supportsTools ? 'Use available tools intelligently to accomplish objectives' : 'Since this model does not support tools, provide detailed step-by-step instructions that the user can follow'}
3. Maintain context in working memory throughout execution
4. Provide transparent reasoning for decisions
5. Adapt plans when steps fail or new information emerges
6. ${this.supportsTools ? 'Request user intervention only when necessary' : 'Clearly explain what actions the user should take to accomplish each step'}

Current model: ${this.config.model || 'gpt-4o'} (Provider: ${this.modelProvider})
${!this.supportsTools ? '\nIMPORTANT: This model does not support tool calling. I will provide detailed instructions and guidance instead of directly executing actions. Please follow the steps I outline to accomplish your objective.' : ''}

${this.supportsTools ? `Available tools: ${context.availableTools.join(', ')}` : ''}

When working without tools:
- Break down tasks into clear, actionable steps
- Provide specific commands or actions the user should take
- Explain the expected outcomes of each step
- Offer troubleshooting advice if something might go wrong
- Maintain a helpful and instructive tone

${this.config.customInstructions ? `\nAdditional instructions:\n${this.config.customInstructions}` : ''}

${this.config.systemPrompt ? `\nSystem context:\n${this.config.systemPrompt}` : ''}`;

    return baseInstructions;
  }

  // Get current model for display/debugging
  get model(): string {
    return this.config.model || 'gpt-4o';
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

    // For now, we'll need to restart the execution
    // TODO: Implement proper pause/resume with conversation history
    if (this.state.currentTask) {
      return this.executeObjective(this.state.currentTask);
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
    this.state.reasoningText.push(entry);

    // Limit reasoning entries to prevent memory issues
    const maxEntries = 100;
    if (this.state.reasoningText.length > maxEntries) {
      this.state.reasoningText = this.state.reasoningText.slice(-maxEntries);
    }
  }

  // Reasoning module methods
  createPlanningReasoning(objective: string, steps: import('../../types/agent').TaskStep[]): ReasoningEntry {
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
      availableResources: Object.keys(this.tools),
      constraints: [],
      previousDecisions: this.state.reasoningText.filter((r) => r.type === 'decision'),
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
      availableTools: Object.keys(this.tools).map((name) => ({
        name,
        serverName: 'unknown',
        capabilities: [],
        performance: {
          averageLatency: 0,
          successRate: 1,
        },
        requiresPermission: false,
      })),
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

  /**
   * Wrap the Vercel AI SDK text stream to emit events in the format expected by our event handler
   */
  private async *wrapTextStream(textStream: AsyncIterable<any>): AsyncIterable<any> {
    try {
      for await (const chunk of textStream) {
        console.log('🔍 [ArchestraAgentNative] Text stream chunk:', chunk);

        // Emit the chunk as a model event that our handler understands
        yield {
          type: 'model',
          event: {
            type: 'text',
            textDelta: chunk,
          },
        };
      }

      // Emit finish event
      yield {
        type: 'model',
        event: {
          type: 'finish',
        },
      };
    } catch (error) {
      console.error('❌ [ArchestraAgentNative] Error in text stream:', error);
      yield {
        type: 'model',
        event: {
          type: 'error',
          error,
        },
      };
    }
  }
}
