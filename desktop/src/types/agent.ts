import type { TextPart, Tool, ToolCallPart, ToolResultPart, UIMessage } from 'ai';

import { ChatMessage, ToolCallInfo } from '../types';

// AI SDK v5 Message Integration Types
/**
 * Extended UIMessage with agent-specific metadata
 */
export interface AgentUIMessage extends UIMessage {
  metadata?: {
    agentMode?: AgentMode;
    planId?: string;
    stepId?: string;
    isFromAgent?: boolean;
  };
}

/**
 * Generic data part interface for custom data streaming
 */
export interface DataPart<T> {
  type: 'data';
  data: T;
}

/**
 * Custom message parts for agent features
 */
export type AgentMessagePart =
  | TextPart
  | ToolCallPart
  | ToolResultPart
  | DataPart<{ type: 'reasoning'; entry: ReasoningEntry }>
  | DataPart<{ type: 'task-progress'; progress: TaskProgress }>
  | DataPart<{ type: 'alternatives'; alternatives: Alternative[] }>;

/**
 * Reasoning streaming part for real-time visibility
 */
export interface ReasoningDataPart {
  type: 'data';
  data: {
    type: 'reasoning';
    entry: ReasoningEntry;
  };
}

/**
 * Task progress streaming part for real-time updates
 */
export interface TaskProgressDataPart {
  type: 'data';
  data: {
    type: 'task-progress';
    progress: TaskProgress;
  };
}

/**
 * Enhanced tool result with v5 features
 */
export interface ToolResultV5 {
  toolCallId: string;
  toolName: string;
  result: unknown; // Type-safe with outputSchema
  timestamp: Date;
  executionTime: number;
}

/**
 * SSE event types for streaming
 */
export type UIMessageStreamEvent =
  | { type: 'message'; message: UIMessage }
  | { type: 'part'; part: AgentMessagePart }
  | { type: 'error'; error: Error }
  | { type: 'finish'; usage: TokenUsage };

/**
 * Token usage tracking
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// Core Agent Configuration
export interface AgentConfig {
  id: string;
  model: string;
  temperature: number;
  maxSteps: number;
  memoryLimit: number;
  reasoningMode: 'verbose' | 'concise' | 'hidden';
  toolTimeout: number;
  autoApproveTools: string[];
}

// Agent State Machine States
export type AgentMode = 'idle' | 'initializing' | 'planning' | 'executing' | 'paused' | 'completed';

// Agent State
export interface AgentState {
  mode: AgentMode;
  currentTask?: string;
  currentAgent?: string; // For tracking handoffs
  plan?: TaskPlan;
  progress: TaskProgress;
  reasoningText: ReasoningEntry[];
  workingMemory: WorkingMemory;
  runState?: any; // SDK's internal state for recovery
  streamingContent?: string; // For real-time updates
}

// Task Planning
export interface TaskPlan {
  id: string;
  objective: string;
  steps: TaskStep[];
  dependencies: TaskDependency[];
  estimatedDuration: number;
  created: Date;
  updated?: Date;
}

export interface TaskStep {
  id: string;
  description: string;
  toolsRequired: string[];
  estimatedDuration: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: StepResult;
  reasoningText?: string;
  retryCount: number;
  maxRetries: number;
  dependencies?: string[]; // Step IDs this step depends on
}

export interface TaskDependency {
  stepId: string;
  dependsOn: string[];
  type: 'sequential' | 'parallel';
}

export interface StepResult {
  success: boolean;
  output?: any;
  error?: string;
  toolResults?: ToolExecutionResult[];
  duration: number;
  timestamp: Date;
}

export interface TaskProgress {
  completed: number;
  total: number;
  currentStep: string | null;
  percentComplete?: number;
  estimatedTimeRemaining?: number;
}

// Memory Management
export interface WorkingMemory {
  id: string;
  agentSessionId: string;
  entries: MemoryEntry[];
  summary?: string;
  created: Date;
  lastAccessed: Date;
  sizeInBytes?: number;
}

export interface MemoryEntry {
  id: string;
  type: 'observation' | 'decision' | 'result' | 'error';
  content: string;
  metadata: Record<string, any>;
  timestamp: Date;
  relevanceScore: number;
  ttl?: number; // Time to live in seconds
  references?: string[]; // IDs of related memory entries
}

// Reasoning and Decision Making
export interface ReasoningEntry {
  id: string;
  type: 'planning' | 'decision' | 'evaluation' | 'adaptation';
  content: string;
  alternatives?: Alternative[];
  selectedOption?: string;
  confidence: number;
  timestamp: Date;
  context?: Record<string, any>;
}

export interface Alternative {
  id: string;
  description: string;
  pros: string[];
  cons: string[];
  feasibility: number;
  estimatedDuration?: number;
}

// Tool Selection and Execution
export interface ToolSelectionCriteria {
  requiredCapabilities: string[];
  preferredServers: string[];
  performanceRequirements: {
    maxLatency: number;
    reliability: number;
  };
  constraints?: ToolConstraints;
}

export interface ToolConstraints {
  excludeServers?: string[];
  requirePermission?: boolean;
  maxCost?: number;
  timeout?: number;
}

export interface ToolExecutionResult {
  toolName: string;
  serverName: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  timestamp: Date;
}

// Agent-Enhanced Chat Messages
export interface AgentChatMessage extends ChatMessage {
  agentMetadata?: {
    planId: string;
    stepId: string;
    reasoningText?: ReasoningEntry;
    memorySnapshot?: string;
    isAgentGenerated: boolean;
  };
}

// Agent-Specific Tool Calls
export interface AgentToolCall extends ToolCallInfo {
  selectionReasoning: string;
  alternativeTools: string[];
  retryStrategy: RetryStrategy;
  priority: 'high' | 'medium' | 'low';
}

export interface RetryStrategy {
  maxRetries: number;
  backoffType: 'exponential' | 'linear' | 'fixed';
  initialDelay: number;
  maxDelay: number;
  retryOn: string[]; // Error codes to retry on
}

// Error Handling
export class AgentError extends Error {
  constructor(
    message: string,
    public code: AgentErrorCode,
    public recoverable: boolean,
    public suggestedAction?: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export enum AgentErrorCode {
  INITIALIZATION_FAILED = 'AGENT_INIT_FAILED',
  PLANNING_FAILED = 'AGENT_PLANNING_FAILED',
  TOOL_SELECTION_FAILED = 'AGENT_TOOL_SELECTION_FAILED',
  TOOL_EXECUTION_FAILED = 'AGENT_TOOL_EXECUTION_FAILED',
  MEMORY_LIMIT_EXCEEDED = 'AGENT_MEMORY_LIMIT',
  OBJECTIVE_UNCLEAR = 'AGENT_OBJECTIVE_UNCLEAR',
  MAX_RETRIES_EXCEEDED = 'AGENT_MAX_RETRIES',
  USER_INTERVENTION_REQUIRED = 'AGENT_USER_INTERVENTION',
  CONTEXT_OVERFLOW = 'AGENT_CONTEXT_OVERFLOW',
  PERMISSION_DENIED = 'AGENT_PERMISSION_DENIED',
}

// Error Recovery
export interface RecoveryResult {
  success: boolean;
  newPlan?: TaskPlan;
  alternativeAction?: string;
  requiresUserInput: boolean;
}

export interface ErrorRecoveryStrategy {
  attemptRecovery(error: AgentError, context: AgentContext): Promise<RecoveryResult>;
  suggestAlternatives(error: AgentError): Alternative[];
  requestUserGuidance(error: AgentError): UserGuidanceRequest;
}

export interface UserGuidanceRequest {
  error: AgentError;
  question: string;
  options: string[];
  defaultOption?: string;
  context: Record<string, any>;
}

// Agent Context
export interface AgentContext {
  objective: string;
  availableTools: ToolInfo[];
  workingMemory: WorkingMemory;
  environmentState: EnvironmentState;
  userPreferences: UserPreferences;
  sessionId: string;
}

export interface ToolInfo {
  name: string;
  serverName: string;
  description?: string;
  capabilities: string[];
  performance: {
    averageLatency: number;
    successRate: number;
    lastUsed?: Date;
  };
  cost?: number;
  requiresPermission: boolean;
  schema?: any; // Tool parameter schema
}

export interface EnvironmentState {
  availableServers: string[];
  activeConnections: number;
  resourceUsage: {
    memory: number;
    cpu: number;
  };
  timestamp: Date;
}

export interface UserPreferences {
  autoApproveTools: string[];
  maxExecutionTime: number;
  preferredServers: string[];
  reasoningVerbosity: 'verbose' | 'concise' | 'hidden';
  interruptOnError: boolean;
}

// Agent Session
export interface AgentSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  objective: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  plan: TaskPlan;
  executionHistory: ExecutionHistoryEntry[];
  finalResult?: any;
  metrics: SessionMetrics;
}

export interface ExecutionHistoryEntry {
  stepId: string;
  action: string;
  result: StepResult;
  timestamp: Date;
  duration: number;
}

export interface SessionMetrics {
  totalDuration: number;
  stepsCompleted: number;
  toolsExecuted: number;
  errorsEncountered: number;
  userInterventions: number;
  memoryUsed: number;
}

// Task Failure Information
export interface TaskFailure {
  stepId: string;
  error: AgentError;
  attemptNumber: number;
  timestamp: Date;
  recoveryAttempted: boolean;
}

// Plan Validation
export interface PlanValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  feasibilityScore: number;
}

// Agent Instance Configuration
export interface ArchestraAgentConfig {
  model?: string;
  mcpTools: Record<string, Tool>;
  maxSteps?: number;
  temperature?: number;
  systemPrompt?: string;
  customInstructions?: string;
  userPreferences?: UserPreferences;
  reasoningMode?: 'verbose' | 'concise' | 'hidden';
  memoryConfig?: {
    maxEntries: number;
    ttlSeconds: number;
    summarizationThreshold: number;
  };
}
