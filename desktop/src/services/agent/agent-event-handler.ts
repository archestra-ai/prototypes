import { AgentState, MemoryEntry, ReasoningEntry, TaskProgress } from '../../types/agent';

// Polyfill for ReadableStream async iterator if not available
if (typeof ReadableStream !== 'undefined' && !(Symbol.asyncIterator in ReadableStream.prototype)) {
  (ReadableStream.prototype as any)[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

// Event types based on OpenAI Agents SDK patterns
export interface StreamEvent {
  type: string;
  timestamp?: Date;
  data?: any;
}

export interface RunAgentUpdatedStreamEvent extends StreamEvent {
  type: 'agent_updated_stream_event';
  agent: {
    name: string;
    id?: string;
    handoffReason?: string;
  };
  previousAgent?: {
    name: string;
    id?: string;
  };
}

export interface RunItemStreamEvent extends StreamEvent {
  type: 'item_stream_event';
  item: {
    type: 'tool_call' | 'message' | 'reasoning' | 'progress' | 'memory';
    id?: string;
    name?: string;
    content?: string;
    arguments?: Record<string, any>;
    result?: any;
    error?: string;
    status?: 'pending' | 'executing' | 'completed' | 'error';
    metadata?: Record<string, any>;
  };
}

export interface RawModelStreamEvent extends StreamEvent {
  type: 'raw_model_stream_event';
  delta: {
    content?: string;
    role?: string;
    functionCall?: {
      name: string;
      arguments: string;
    };
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ToolExecutionEvent extends StreamEvent {
  type: 'tool_execution_event';
  tool: {
    id: string;
    name: string;
    serverName: string;
    arguments: Record<string, any>;
    status: 'pending' | 'executing' | 'completed' | 'error';
    result?: any;
    error?: string;
    executionTime?: number;
  };
}

export interface ReasoningEvent extends StreamEvent {
  type: 'reasoning_event';
  reasoning: {
    type: 'planning' | 'decision' | 'evaluation' | 'adaptation';
    content: string;
    confidence: number;
    alternatives?: string[];
    selectedOption?: string;
  };
}

export interface ProgressEvent extends StreamEvent {
  type: 'progress_event';
  progress: {
    completed: number;
    total: number;
    currentStep?: string;
    percentComplete?: number;
    estimatedTimeRemaining?: number;
  };
}

export interface ErrorEvent extends StreamEvent {
  type: 'error_event';
  error: {
    code: string;
    message: string;
    recoverable: boolean;
    suggestedAction?: string;
    context?: Record<string, any>;
  };
}

// Union type for all possible stream events
export type AgentStreamEvent =
  | RunAgentUpdatedStreamEvent
  | RunItemStreamEvent
  | RawModelStreamEvent
  | ToolExecutionEvent
  | ReasoningEvent
  | ProgressEvent
  | ErrorEvent;

// Callback interface for event handling
export interface AgentEventCallbacks {
  onStateChange: (state: Partial<AgentState>) => void;
  onToolExecution: (tool: any) => Promise<void>;
  onMessage: (message: string, type?: 'info' | 'warning' | 'error') => void;
  onReasoningUpdate: (entry: ReasoningEntry) => void;
  onProgressUpdate: (progress: Partial<TaskProgress>) => void;
  onMemoryUpdate: (entry: MemoryEntry) => void;
  onError: (error: any) => void;
}

/**
 * AgentEventHandler processes streaming events from the OpenAI Agents SDK
 * and transforms them into appropriate state updates and callbacks.
 */
export class AgentEventHandler {
  private eventCount = 0;
  private startTime = Date.now();
  private lastProgressUpdate = 0;

  constructor(private callbacks: AgentEventCallbacks) {}

  /**
   * Main entry point for handling streamed results from the SDK
   */
  async handleStreamedResult(stream: AsyncIterable<any> | ReadableStream<any>): Promise<void> {
    console.log('🎬 [AgentEventHandler] Starting to handle streamed result');

    try {
      // Check if it's a ReadableStream (Web Streams API)
      if (stream && stream instanceof ReadableStream) {
        console.log('📊 [AgentEventHandler] Detected ReadableStream, using async iterator');

        // With our polyfill, ReadableStream should now be async iterable
        for await (const event of stream as any) {
          this.eventCount++;
          console.log(`📨 [AgentEventHandler] Event #${this.eventCount}:`, {
            type: event?.type,
            eventKeys: event ? Object.keys(event) : [],
          });
          await this.processEvent(event);
        }

        console.log(`✅ [AgentEventHandler] Finished processing ${this.eventCount} events`);
        return;
      }

      // Check if stream is actually iterable
      if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
        console.error('❌ [AgentEventHandler] Stream is not async iterable:', {
          streamType: typeof stream,
          streamConstructor: stream?.constructor?.name,
          hasAsyncIterator: stream && typeof stream[Symbol.asyncIterator],
          streamKeys: stream ? Object.keys(stream) : [],
        });

        // Check if it's a StreamedRunResult that needs toStream() call
        if (stream && typeof (stream as any).toStream === 'function') {
          console.log('🔄 [AgentEventHandler] Found toStream() method, converting...');
          const readableStream = (stream as any).toStream();
          // Recursively call with the converted stream
          return this.handleStreamedResult(readableStream);
        } else {
          throw new Error('Stream is not iterable and has no toStream() method');
        }
      }

      // Handle regular async iterable
      for await (const event of stream) {
        this.eventCount++;
        console.log(`📨 [AgentEventHandler] Event #${this.eventCount}:`, {
          type: event?.type,
          eventKeys: event ? Object.keys(event) : [],
        });
        await this.processEvent(event);
      }

      console.log(`✅ [AgentEventHandler] Finished processing ${this.eventCount} events`);
    } catch (error) {
      console.error('❌ [AgentEventHandler] Error processing agent stream:', error);

      // Log more details about the error
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });
      }

      this.callbacks.onError(error);
      throw error;
    }
  }

  /**
   * Process individual stream events
   */
  private async processEvent(event: any): Promise<void> {
    // Add timestamp if not present
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    console.log(`🎯 [AgentEventHandler] Processing event type: ${event.type}`, {
      eventDetails: event,
      hasAgent: !!event.agent,
      hasItem: !!event.item,
      hasDelta: !!event.delta,
    });

    switch (event.type) {
      case 'agent_updated_stream_event':
        console.log('👤 [AgentEventHandler] Agent update event');
        this.handleAgentUpdate(event as RunAgentUpdatedStreamEvent);
        break;

      case 'item_stream_event':
        console.log('📦 [AgentEventHandler] Item stream event');
        await this.handleItemEvent(event as RunItemStreamEvent);
        break;

      case 'raw_model_stream_event':
        console.log('🤖 [AgentEventHandler] Raw model stream event');
        this.handleModelStream(event as RawModelStreamEvent);
        break;

      case 'tool_execution_event':
        console.log('🔧 [AgentEventHandler] Tool execution event');
        await this.handleToolExecution(event as ToolExecutionEvent);
        break;

      case 'reasoning_event':
        console.log('🧠 [AgentEventHandler] Reasoning event');
        this.handleReasoningEvent(event as ReasoningEvent);
        break;

      case 'progress_event':
        console.log('📊 [AgentEventHandler] Progress event');
        this.handleProgressEvent(event as ProgressEvent);
        break;

      case 'error_event':
        console.log('❌ [AgentEventHandler] Error event');
        this.handleErrorEvent(event as ErrorEvent);
        break;

      case 'run_item_stream_event':
        console.log('📋 [AgentEventHandler] Run item stream event');
        await this.handleRunItemStreamEvent(event);
        break;

      default:
        // Handle unknown event types gracefully
        console.log('❓ [AgentEventHandler] Unknown event type:', event.type, event);

        // Handle OpenAI SDK specific events
        if (event.type === 'response_started') {
          console.log('🚀 [AgentEventHandler] Response started');
        } else if (event.type === 'response_done') {
          console.log('🏁 [AgentEventHandler] Response done:', event.response);
          if (event.response?.output) {
            // Process the final output
            for (const output of event.response.output) {
              if (output.type === 'message' && output.content) {
                for (const content of output.content) {
                  if (content.type === 'output_text') {
                    this.callbacks.onMessage(content.text, 'info');
                  }
                }
              }
            }
          }
        } else if (event.type === 'output_text_delta') {
          console.log('📝 [AgentEventHandler] Output text delta:', event.delta);
          // Use onMessage to accumulate text (it now handles accumulation)
          this.callbacks.onMessage(event.delta, 'info');
        }
        // Check if this is a model event from AI SDK
        else if (event.type === 'model' && event.event) {
          console.log('🤖 [AgentEventHandler] Processing AI SDK model event:', {
            eventType: event.event.type,
            hasTextDelta: !!event.event.textDelta,
            textDelta: event.event.textDelta,
            fullEvent: event.event,
          });
          // Process the nested event
          if (event.event.type === 'text-delta' && event.event.textDelta) {
            // Filter out qwen3's thinking tags
            const text = event.event.textDelta;
            if (!text.includes('<think>') && !text.includes('</think>')) {
              // Use onMessage to accumulate text (it now handles accumulation)
              this.callbacks.onMessage(text, 'info');
            }
          } else if (event.event.type === 'tool-call') {
            console.log('🛠️ [AgentEventHandler] Model is calling tool:', event.event.toolName);
            this.callbacks.onMessage(`Calling tool: ${event.event.toolName}`, 'info');
          } else if (event.event.type === 'finish') {
            console.log('✅ [AgentEventHandler] Stream finished');
          } else if (event.event.type === 'response-metadata') {
            console.log('📋 [AgentEventHandler] Response metadata:', event.event);
          } else if (event.event.type === 'error') {
            console.error('❌ [AgentEventHandler] Stream error:', event.event.error);
            this.callbacks.onError(event.event.error);
          }
        }
        break;
    }
  }

  /**
   * Handle agent handoff events
   */
  private handleAgentUpdate(event: RunAgentUpdatedStreamEvent): void {
    const stateUpdate: Partial<AgentState> = {};

    if (event.agent?.name) {
      stateUpdate.currentAgent = event.agent.name;

      // Create reasoning entry for agent handoff
      if (event.previousAgent?.name) {
        const reasoningEntry: ReasoningEntry = {
          id: crypto.randomUUID(),
          type: 'decision',
          content: `Handed off from ${event.previousAgent.name} to ${event.agent.name}${
            event.agent.handoffReason ? `: ${event.agent.handoffReason}` : ''
          }`,
          confidence: 1.0,
          timestamp: event.timestamp || new Date(),
        };

        this.callbacks.onReasoningUpdate(reasoningEntry);
      }

      this.callbacks.onMessage(`Agent switched to: ${event.agent.name}`, 'info');
    }

    if (Object.keys(stateUpdate).length > 0) {
      this.callbacks.onStateChange(stateUpdate);
    }
  }

  /**
   * Handle item events (tool calls, messages, etc.)
   */
  private async handleItemEvent(event: RunItemStreamEvent): Promise<void> {
    const { item } = event;

    switch (item.type) {
      case 'tool_call':
        await this.handleToolCallItem(item);
        break;

      case 'message':
        if (item.content) {
          this.callbacks.onMessage(item.content, 'info');
        }
        break;

      case 'reasoning':
        this.handleReasoningItem(item);
        break;

      case 'progress':
        this.handleProgressItem(item);
        break;

      case 'memory':
        this.handleMemoryItem(item);
        break;

      default:
        console.log('Unknown item type:', item.type, item);
        break;
    }
  }

  /**
   * Handle tool call items
   */
  private async handleToolCallItem(item: any): Promise<void> {
    try {
      await this.callbacks.onToolExecution({
        id: item.id || crypto.randomUUID(),
        name: item.name,
        arguments: item.arguments || {},
        status: item.status || 'pending',
        result: item.result,
        error: item.error,
      });

      // Create memory entry for tool execution
      if (item.result || item.error) {
        const memoryEntry: MemoryEntry = {
          id: crypto.randomUUID(),
          type: item.error ? 'error' : 'result',
          content: `Tool ${item.name}: ${item.error || 'Success'}`,
          metadata: {
            toolName: item.name,
            arguments: item.arguments,
            result: item.result,
            error: item.error,
          },
          timestamp: new Date(),
          relevanceScore: 0.8,
        };

        this.callbacks.onMemoryUpdate(memoryEntry);
      }
    } catch (error) {
      console.error('Error handling tool call:', error);
      this.callbacks.onError(error);
    }
  }

  /**
   * Handle reasoning items
   */
  private handleReasoningItem(item: any): void {
    if (item.content) {
      const reasoningEntry: ReasoningEntry = {
        id: item.id || crypto.randomUUID(),
        type: item.metadata?.type || 'decision',
        content: item.content,
        confidence: item.metadata?.confidence || 0.7,
        timestamp: new Date(),
        alternatives: item.metadata?.alternatives,
        selectedOption: item.metadata?.selectedOption,
      };

      this.callbacks.onReasoningUpdate(reasoningEntry);
    }
  }

  /**
   * Handle progress items
   */
  private handleProgressItem(item: any): void {
    if (item.metadata) {
      const progress: Partial<TaskProgress> = {
        completed: item.metadata.completed,
        total: item.metadata.total,
        currentStep: item.metadata.currentStep,
        percentComplete: item.metadata.percentComplete,
        estimatedTimeRemaining: item.metadata.estimatedTimeRemaining,
      };

      this.callbacks.onProgressUpdate(progress);
    }
  }

  private async handleRunItemStreamEvent(event: any): Promise<void> {
    console.log('📄 [AgentEventHandler] Processing run_item_stream_event:', {
      name: event.name,
      itemType: event.item?.type,
      hasContent: !!event.item?.content,
    });

    // Handle different types of run item stream events
    if (event.name === 'message_output_created' && event.item) {
      // This is a message output from the agent
      if (event.item.content) {
        // Send the content to onMessage callback
        this.callbacks.onMessage(event.item.content, 'info');
      }
    } else if (event.item) {
      // Try to handle as a regular item event
      await this.handleItemEvent({
        type: 'item_stream_event',
        item: event.item,
        timestamp: event.timestamp,
      } as RunItemStreamEvent);
    }
  }

  /**
   * Handle memory items
   */
  private handleMemoryItem(item: any): void {
    if (item.content) {
      const memoryEntry: MemoryEntry = {
        id: item.id || crypto.randomUUID(),
        type: item.metadata?.type || 'observation',
        content: item.content,
        metadata: item.metadata || {},
        timestamp: new Date(),
        relevanceScore: item.metadata?.relevanceScore || 0.5,
      };

      this.callbacks.onMemoryUpdate(memoryEntry);
    }
  }

  /**
   * Handle raw model streaming events
   */
  private handleModelStream(event: RawModelStreamEvent): void {
    // Log the raw event data to understand what we're receiving
    console.log('🔍 [AgentEventHandler] Raw model stream data:', {
      hasData: !!event.data,
      dataType: event.data?.type,
      dataContent: event.data,
      // Log the entire event to see all fields
      fullEvent: JSON.stringify(event, null, 2),
      hasDelta: !!event.delta,
      deltaContent: event.delta,
    });

    if (event.delta?.content) {
      this.callbacks.onStateChange({
        streamingContent: event.delta.content,
      });
    }

    // Handle function calls from the model
    if (event.delta?.functionCall) {
      this.callbacks.onMessage(`Model calling function: ${event.delta.functionCall.name}`, 'info');
    }

    // Check if the data contains actual model output
    if (event.data) {
      // Handle text delta from the model
      if (event.data.type === 'output_text_delta' && event.data.delta) {
        // Use onMessage to accumulate text (it now handles accumulation)
        this.callbacks.onMessage(event.data.delta, 'info');
      }

      // Handle tool calls
      if (event.data.type === 'tool-call' && event.data.toolName) {
        console.log('🛠️ [AgentEventHandler] Model is calling tool:', event.data.toolName);
        this.callbacks.onMessage(`Calling tool: ${event.data.toolName}`, 'info');
      }
    }
  }

  /**
   * Handle tool execution events
   */
  private async handleToolExecution(event: ToolExecutionEvent): Promise<void> {
    try {
      await this.callbacks.onToolExecution(event.tool);

      // Update reasoning with tool execution
      const reasoningEntry: ReasoningEntry = {
        id: crypto.randomUUID(),
        type: 'decision',
        content: `Executing tool: ${event.tool.name} on server ${event.tool.serverName}`,
        confidence: 0.9,
        timestamp: event.timestamp || new Date(),
      };

      this.callbacks.onReasoningUpdate(reasoningEntry);
    } catch (error) {
      console.error('Error in tool execution event:', error);
      this.callbacks.onError(error);
    }
  }

  /**
   * Handle reasoning events
   */
  private handleReasoningEvent(event: ReasoningEvent): void {
    const reasoningEntry: ReasoningEntry = {
      id: crypto.randomUUID(),
      type: event.reasoning.type,
      content: event.reasoning.content,
      confidence: event.reasoning.confidence,
      timestamp: event.timestamp || new Date(),
      alternatives: event.reasoning.alternatives?.map((alt, index) => ({
        id: `${index}`,
        description: alt,
        pros: [],
        cons: [],
        feasibility: 0.5,
      })),
      selectedOption: event.reasoning.selectedOption,
    };

    this.callbacks.onReasoningUpdate(reasoningEntry);
  }

  /**
   * Handle progress events
   */
  private handleProgressEvent(event: ProgressEvent): void {
    const now = Date.now();

    // Throttle progress updates to avoid overwhelming the UI
    if (now - this.lastProgressUpdate > 100) {
      // 100ms throttle
      this.callbacks.onProgressUpdate(event.progress);
      this.lastProgressUpdate = now;
    }
  }

  /**
   * Handle error events
   */
  private handleErrorEvent(event: ErrorEvent): void {
    const error = new Error(event.error.message);
    (error as any).code = event.error.code;
    (error as any).recoverable = event.error.recoverable;
    (error as any).suggestedAction = event.error.suggestedAction;
    (error as any).context = event.error.context;

    this.callbacks.onError(error);
    this.callbacks.onMessage(
      `Error: ${event.error.message}${event.error.suggestedAction ? ` - ${event.error.suggestedAction}` : ''}`,
      'error'
    );
  }

  /**
   * Get handler statistics
   */
  getStatistics() {
    return {
      eventCount: this.eventCount,
      uptime: Date.now() - this.startTime,
      eventsPerSecond: this.eventCount / ((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Reset handler state
   */
  reset(): void {
    this.eventCount = 0;
    this.startTime = Date.now();
    this.lastProgressUpdate = 0;
  }
}

/**
 * Create a default event handler with console logging fallbacks
 */
export function createDefaultEventHandler(partialCallbacks: Partial<AgentEventCallbacks>): AgentEventHandler {
  const defaultCallbacks: AgentEventCallbacks = {
    onStateChange: (state) => console.log('State change:', state),
    onToolExecution: async (tool) => console.log('Tool execution:', tool),
    onMessage: (message, type) => console.log(`[${type || 'info'}]`, message),
    onReasoningUpdate: (entry) => console.log('Reasoning:', entry),
    onProgressUpdate: (progress) => console.log('Progress:', progress),
    onMemoryUpdate: (entry) => console.log('Memory:', entry),
    onError: (error) => console.error('Agent error:', error),
    ...partialCallbacks,
  };

  return new AgentEventHandler(defaultCallbacks);
}
