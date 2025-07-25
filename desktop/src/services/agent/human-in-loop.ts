import { AgentError, AgentErrorCode } from '@/types/agent';

import { ToolCategory, categorizeeTool, isToolSensitive } from './mcp-tool-wrapper-ai-sdk';

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
 * Configuration for the human-in-the-loop handler
 */
export interface HumanInLoopConfig {
  requestApproval: ApprovalRequestCallback;
  defaultTimeout?: number; // Default timeout for approval requests in ms
  autoApproveCategories?: ToolCategory[];
  autoApproveServers?: string[];
  rememberDecisions?: boolean;
  maxPendingRequests?: number;
}

/**
 * Manages approval decisions for future reference
 */
interface ApprovalDecisionCache {
  tool: string;
  server: string;
  decision: boolean;
  pattern?: string; // Regex pattern for arguments
  expiresAt?: Date;
}

/**
 * Human-in-the-loop handler for managing tool approval workflows
 */
export class HumanInLoopHandler {
  private config: HumanInLoopConfig;
  private pendingRequests: Map<string, ToolApprovalRequest> = new Map();
  private decisionCache: ApprovalDecisionCache[] = [];
  private approvalHistory: ToolApprovalResult[] = [];

  constructor(config: HumanInLoopConfig) {
    this.config = {
      defaultTimeout: 300000, // 5 minutes default
      rememberDecisions: true,
      maxPendingRequests: 10,
      ...config,
    };
  }

  /**
   * Check if a tool execution requires approval
   */
  async requiresApproval(
    toolName: string,
    serverName: string,
    args: Record<string, any>,
    description?: string
  ): Promise<boolean> {
    // Check auto-approval settings
    const category = categorizeeTool(toolName, description);

    // Check if category is auto-approved
    if (this.config.autoApproveCategories?.includes(category)) {
      return false;
    }

    // Check if server is auto-approved
    if (this.config.autoApproveServers?.includes(serverName)) {
      return false;
    }

    // Check if tool is sensitive
    if (!isToolSensitive(toolName)) {
      // Non-sensitive tools in non-auto-approved categories still need approval
      // unless explicitly configured otherwise
      return true;
    }

    // Check decision cache
    if (this.config.rememberDecisions) {
      const cachedDecision = this.findCachedDecision(toolName, serverName, args);
      if (cachedDecision !== undefined) {
        return !cachedDecision; // If approved before, doesn't require approval
      }
    }

    // Sensitive tools always require approval unless cached
    return true;
  }

  /**
   * Request approval for a tool execution
   */
  async requestApproval(
    toolName: string,
    serverName: string,
    args: Record<string, any>,
    options?: {
      description?: string;
      timeout?: number;
      metadata?: ToolApprovalRequest['metadata'];
    }
  ): Promise<ToolApprovalResult> {
    // Check if we've reached the max pending requests limit
    if (this.pendingRequests.size >= (this.config.maxPendingRequests || 10)) {
      throw new AgentError(
        'Too many pending approval requests',
        AgentErrorCode.USER_INTERVENTION_REQUIRED,
        false,
        'Please respond to existing approval requests first'
      );
    }

    const request: ToolApprovalRequest = {
      id: crypto.randomUUID(),
      toolName,
      serverName,
      description: options?.description,
      arguments: args,
      category: categorizeeTool(toolName, options?.description),
      isSensitive: isToolSensitive(toolName),
      timestamp: new Date(),
      timeout: options?.timeout || this.config.defaultTimeout,
      metadata: options?.metadata,
    };

    // Store pending request
    this.pendingRequests.set(request.id, request);

    try {
      // Set up timeout
      const timeoutPromise = new Promise<ToolApprovalResult>((_, reject) => {
        setTimeout(() => {
          reject(
            new AgentError(
              `Approval request timed out for tool: ${toolName}`,
              AgentErrorCode.USER_INTERVENTION_REQUIRED,
              true,
              'The approval request timed out. Please try again.'
            )
          );
        }, request.timeout);
      });

      // Request approval with timeout
      const approvalPromise = this.config.requestApproval(request);
      const result = await Promise.race([approvalPromise, timeoutPromise]);

      // Store result in history
      this.approvalHistory.push(result);

      // Cache decision if requested
      if (result.rememberDecision && this.config.rememberDecisions) {
        this.cacheDecision(toolName, serverName, result.approved, args);
      }

      // Remove from pending
      this.pendingRequests.delete(request.id);

      return result;
    } catch (error) {
      // Remove from pending on error
      this.pendingRequests.delete(request.id);
      throw error;
    }
  }

  /**
   * Handle multiple approval requests (batch approval)
   */
  async handleBatchApprovals(
    requests: Array<{
      toolName: string;
      serverName: string;
      args: Record<string, any>;
      description?: string;
    }>
  ): Promise<ToolApprovalResult[]> {
    const results: ToolApprovalResult[] = [];

    for (const req of requests) {
      try {
        const result = await this.requestApproval(req.toolName, req.serverName, req.args, {
          description: req.description,
        });
        results.push(result);

        // If one is rejected, potentially skip remaining
        if (!result.approved && result.reason?.includes('cancel all')) {
          // Create rejection results for remaining requests
          for (let i = results.length; i < requests.length; i++) {
            results.push({
              requestId: crypto.randomUUID(),
              approved: false,
              reason: 'Cancelled by user',
              timestamp: new Date(),
            });
          }
          break;
        }
      } catch (error) {
        // Handle individual request errors
        results.push({
          requestId: crypto.randomUUID(),
          approved: false,
          reason: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Find a cached decision for a tool
   */
  private findCachedDecision(toolName: string, serverName: string, args: Record<string, any>): boolean | undefined {
    const now = new Date();

    // Clean expired decisions
    this.decisionCache = this.decisionCache.filter((cache) => !cache.expiresAt || cache.expiresAt > now);

    // Find matching decision
    const cache = this.decisionCache.find(
      (c) => c.tool === toolName && c.server === serverName && (!c.pattern || this.matchesPattern(args, c.pattern))
    );

    return cache?.decision;
  }

  /**
   * Cache an approval decision
   */
  private cacheDecision(toolName: string, serverName: string, approved: boolean, args?: Record<string, any>): void {
    const cache: ApprovalDecisionCache = {
      tool: toolName,
      server: serverName,
      decision: approved,
      // Set expiration for 1 hour by default
      expiresAt: new Date(Date.now() + 3600000),
    };

    // If args are simple enough, create a pattern
    if (args && this.canCreatePattern(args)) {
      cache.pattern = this.createArgumentPattern(args);
    }

    this.decisionCache.push(cache);

    // Limit cache size
    if (this.decisionCache.length > 100) {
      this.decisionCache = this.decisionCache.slice(-100);
    }
  }

  /**
   * Check if arguments can be converted to a pattern
   */
  private canCreatePattern(args: Record<string, any>): boolean {
    // Only create patterns for simple argument structures
    const values = Object.values(args);
    return values.every((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
  }

  /**
   * Create a pattern from arguments for caching
   */
  private createArgumentPattern(args: Record<string, any>): string {
    // Create a simple pattern based on argument structure
    const keys = Object.keys(args).sort();
    return keys.join(',');
  }

  /**
   * Check if arguments match a cached pattern
   */
  private matchesPattern(args: Record<string, any>, pattern: string): boolean {
    const keys = Object.keys(args).sort();
    return keys.join(',') === pattern;
  }

  /**
   * Get all pending approval requests
   */
  getPendingRequests(): ToolApprovalRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Cancel a pending approval request
   */
  cancelRequest(requestId: string): boolean {
    return this.pendingRequests.delete(requestId);
  }

  /**
   * Clear all cached decisions
   */
  clearDecisionCache(): void {
    this.decisionCache = [];
  }

  /**
   * Get approval history
   */
  getApprovalHistory(limit?: number): ToolApprovalResult[] {
    const history = [...this.approvalHistory];
    history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Update auto-approval settings
   */
  updateAutoApprovalSettings(settings: { categories?: ToolCategory[]; servers?: string[] }): void {
    if (settings.categories) {
      this.config.autoApproveCategories = settings.categories;
    }
    if (settings.servers) {
      this.config.autoApproveServers = settings.servers;
    }
  }

  /**
   * Get statistics about approvals
   */
  getStatistics() {
    const total = this.approvalHistory.length;
    const approved = this.approvalHistory.filter((r) => r.approved).length;
    const rejected = total - approved;
    const avgResponseTime = this.calculateAverageResponseTime();

    return {
      totalRequests: total,
      approved,
      rejected,
      approvalRate: total > 0 ? approved / total : 0,
      pendingRequests: this.pendingRequests.size,
      cachedDecisions: this.decisionCache.length,
      averageResponseTime: avgResponseTime,
    };
  }

  private calculateAverageResponseTime(): number {
    // This would need request start times to be stored
    // For now, return 0
    return 0;
  }

  /**
   * Export approval history for analysis
   */
  exportHistory(): string {
    const data = {
      history: this.approvalHistory,
      statistics: this.getStatistics(),
      exportedAt: new Date().toISOString(),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Reset handler state
   */
  reset(): void {
    this.pendingRequests.clear();
    this.decisionCache = [];
    this.approvalHistory = [];
  }
}

/**
 * Create a UI-integrated approval handler
 */
export function createUIApprovalHandler(
  showApprovalDialog: (request: ToolApprovalRequest) => Promise<ToolApprovalResult>
): HumanInLoopHandler {
  return new HumanInLoopHandler({
    requestApproval: showApprovalDialog,
    defaultTimeout: 300000, // 5 minutes
    rememberDecisions: true,
  });
}

/**
 * Create a console-based approval handler for testing
 */
export function createConsoleApprovalHandler(): HumanInLoopHandler {
  return new HumanInLoopHandler({
    requestApproval: async (request) => {
      console.log('\n🔔 Tool Approval Required:');
      console.log(`Tool: ${request.toolName} on ${request.serverName}`);
      console.log(`Category: ${request.category} (Sensitive: ${request.isSensitive})`);
      console.log(`Arguments:`, request.arguments);
      console.log(`Risk Level: ${request.metadata?.riskLevel || 'unknown'}`);

      // In a real implementation, this would wait for user input
      // For now, auto-approve non-sensitive tools
      const approved = !request.isSensitive;

      return {
        requestId: request.id,
        approved,
        reason: approved ? 'Auto-approved for testing' : 'Sensitive tool requires manual approval',
        timestamp: new Date(),
        rememberDecision: false,
      };
    },
  });
}
