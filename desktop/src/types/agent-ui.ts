/**
 * UI-only types for agent functionality
 * Migrated from services/agent during refactoring
 */
import type { AgentError, AgentErrorCode, AgentMode, AgentState, ReasoningEntry, TaskProgress } from './agent';

// Tool categories for UI display
export enum ToolCategory {
  SYSTEM = 'system',
  DATA = 'data',
  SECURITY = 'security',
  FILE = 'file',
  NETWORK = 'network',
  OTHER = 'other',
}

/**
 * Represents a tool that requires approval before execution
 */
export interface ToolApprovalRequest {
  id: string;
  toolName: string;
  serverName: string;
  description?: string;
  arguments: Record<string, any>;
  category: ToolCategory;
  isSensitive: boolean;
  timestamp: Date;
  timeout?: number; // Timeout in milliseconds
  metadata?: {
    riskLevel: 'low' | 'medium' | 'high';
    estimatedDuration?: number;
    potentialImpact?: string[];
  };
}

/**
 * Result of a tool approval decision
 */
export interface ToolApprovalResult {
  requestId: string;
  approved: boolean;
  reason?: string;
  approvedBy?: string;
  timestamp: Date;
  rememberDecision?: boolean; // Whether to remember this decision for similar requests
}

/**
 * Callback function for requesting user approval
 */
export type ApprovalRequestCallback = (request: ToolApprovalRequest) => Promise<ToolApprovalResult>;

/**
 * Stub for HumanInLoopHandler - actual implementation runs on backend
 * This is kept for UI component compatibility
 */
export interface HumanInLoopHandler {
  requiresApproval: (
    toolName: string,
    serverName: string,
    args: Record<string, any>,
    description?: string
  ) => Promise<boolean>;
  requestApproval: (
    toolName: string,
    serverName: string,
    args: Record<string, any>,
    options?: any
  ) => Promise<ToolApprovalResult>;
  updateAutoApprovalSettings?: (settings: { categories: ToolCategory[]; servers: string[] }) => void;
}

/**
 * Creates a UI approval handler (stub for compatibility)
 */
export function createUIApprovalHandler(callback: ApprovalRequestCallback): HumanInLoopHandler {
  return {
    requiresApproval: async () => false, // Backend decides
    requestApproval: async (toolName, serverName, args) => {
      const request: ToolApprovalRequest = {
        id: crypto.randomUUID(),
        toolName,
        serverName,
        arguments: args,
        category: ToolCategory.OTHER,
        isSensitive: false,
        timestamp: new Date(),
      };
      return callback(request);
    },
  };
}

/**
 * Agent UI state (keep only UI-related types)
 */
export interface AgentUIState {
  mode: AgentMode;
  isRunning: boolean;
  progress: TaskProgress | null;
  reasoningEntries: ReasoningEntry[];
}

// Re-export types for convenience
export type { AgentMode, TaskProgress, ReasoningEntry, AgentState, AgentError, AgentErrorCode };
