import { ApprovalRequestCallback, HumanInLoopHandler, ToolApprovalRequest, ToolCategory } from '@/types/agent-ui';

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
