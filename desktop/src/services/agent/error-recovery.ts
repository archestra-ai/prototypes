import { useChatStore } from '../../stores/chat-store';
import {
  AgentContext,
  AgentError,
  AgentErrorCode,
  Alternative,
  ErrorRecoveryStrategy,
  RecoveryResult,
  TaskPlan,
  UserGuidanceRequest,
} from '../../types/agent';

/**
 * Default error recovery strategy for the agent
 * Implements various recovery mechanisms based on error type
 */
export class DefaultErrorRecoveryStrategy implements ErrorRecoveryStrategy {
  private retryAttempts: Map<string, number> = new Map();
  private maxRetries = 3;

  /**
   * Attempt to recover from an error
   */
  async attemptRecovery(error: AgentError, context: AgentContext): Promise<RecoveryResult> {
    const errorKey = `${error.code}-${error.message}`;
    const attempts = this.retryAttempts.get(errorKey) || 0;

    // Check if we've exceeded max retries
    if (attempts >= this.maxRetries) {
      return {
        success: false,
        requiresUserInput: true,
        alternativeAction: 'Maximum retry attempts exceeded. User intervention required.',
      };
    }

    this.retryAttempts.set(errorKey, attempts + 1);

    // Handle specific error types
    switch (error.code) {
      case AgentErrorCode.INITIALIZATION_FAILED:
        return this.handleInitializationFailure(error, context);

      case AgentErrorCode.PLANNING_FAILED:
        return this.handlePlanningFailure(error, context);

      case AgentErrorCode.TOOL_SELECTION_FAILED:
        return this.handleToolSelectionFailure(error, context);

      case AgentErrorCode.TOOL_EXECUTION_FAILED:
        return this.handleToolExecutionFailure(error, context);

      case AgentErrorCode.MEMORY_LIMIT_EXCEEDED:
        return this.handleMemoryLimitExceeded(error, context);

      case AgentErrorCode.OBJECTIVE_UNCLEAR:
        return this.handleObjectiveUnclear(error, context);

      case AgentErrorCode.MAX_RETRIES_EXCEEDED:
        return this.handleMaxRetriesExceeded(error, context);

      case AgentErrorCode.USER_INTERVENTION_REQUIRED:
        return this.handleUserInterventionRequired(error, context);

      case AgentErrorCode.CONTEXT_OVERFLOW:
        return this.handleContextOverflow(error, context);

      case AgentErrorCode.PERMISSION_DENIED:
        return this.handlePermissionDenied(error, context);

      default:
        return {
          success: false,
          requiresUserInput: true,
          alternativeAction: 'Unknown error type. User intervention required.',
        };
    }
  }

  /**
   * Suggest alternative approaches based on the error
   */
  suggestAlternatives(error: AgentError): Alternative[] {
    const alternatives: Alternative[] = [];

    switch (error.code) {
      case AgentErrorCode.TOOL_SELECTION_FAILED:
        alternatives.push({
          id: 'manual-tool-selection',
          description: 'Let the user manually select the appropriate tool',
          pros: ['User has full control', 'Can leverage human expertise'],
          cons: ['Requires user intervention', 'Slower execution'],
          feasibility: 1.0,
        });
        alternatives.push({
          id: 'simplified-approach',
          description: 'Break down the task into simpler sub-tasks',
          pros: ['More manageable', 'Less likely to fail'],
          cons: ['May take longer', 'Could miss optimizations'],
          feasibility: 0.8,
        });
        break;

      case AgentErrorCode.MEMORY_LIMIT_EXCEEDED:
        alternatives.push({
          id: 'summarize-memory',
          description: 'Summarize current memory to free up space',
          pros: ['Retains important information', 'Automatic'],
          cons: ['May lose some details', 'Requires processing time'],
          feasibility: 0.9,
        });
        alternatives.push({
          id: 'selective-memory',
          description: 'Keep only task-relevant memories',
          pros: ['More focused', 'Efficient use of memory'],
          cons: ['May miss connections', 'Requires analysis'],
          feasibility: 0.85,
        });
        break;

      case AgentErrorCode.OBJECTIVE_UNCLEAR:
        alternatives.push({
          id: 'clarify-objective',
          description: 'Ask user for clarification on the objective',
          pros: ['Gets precise requirements', 'Avoids misunderstandings'],
          cons: ['Requires user interaction', 'Delays execution'],
          feasibility: 1.0,
        });
        alternatives.push({
          id: 'best-guess',
          description: 'Proceed with best interpretation of objective',
          pros: ['No delay', 'May be correct'],
          cons: ['Risk of wrong approach', 'May need rework'],
          feasibility: 0.6,
        });
        break;

      default:
        alternatives.push({
          id: 'retry',
          description: 'Retry the operation',
          pros: ['Simple', 'May work on second attempt'],
          cons: ['May fail again', 'No guarantee of success'],
          feasibility: 0.5,
        });
        alternatives.push({
          id: 'user-intervention',
          description: 'Request user intervention',
          pros: ['Guaranteed resolution', 'User can provide context'],
          cons: ['Requires user availability', 'Breaks automation'],
          feasibility: 1.0,
        });
    }

    return alternatives;
  }

  /**
   * Create a user guidance request for the error
   */
  requestUserGuidance(error: AgentError): UserGuidanceRequest {
    const alternatives = this.suggestAlternatives(error);
    const options = alternatives.map((alt) => alt.description);

    let question = 'How would you like to proceed?';
    let defaultOption = options[0];

    switch (error.code) {
      case AgentErrorCode.OBJECTIVE_UNCLEAR:
        question =
          'The objective is unclear. Could you please provide more details or clarify what you want to achieve?';
        break;

      case AgentErrorCode.TOOL_SELECTION_FAILED:
        question = "I couldn't determine which tool to use. Which approach would you prefer?";
        break;

      case AgentErrorCode.PERMISSION_DENIED:
        question =
          'Permission was denied for this operation. Would you like to grant permission or try a different approach?';
        break;

      case AgentErrorCode.MEMORY_LIMIT_EXCEEDED:
        question = 'Memory limit exceeded. How should I manage the memory?';
        break;

      default:
        question = `An error occurred: ${error.message}. How would you like to proceed?`;
    }

    return {
      error,
      question,
      options,
      defaultOption,
      context: error.context || {},
    };
  }

  // Private recovery methods for specific error types

  private async handleInitializationFailure(_error: AgentError, _context: AgentContext): Promise<RecoveryResult> {
    // Try to reinitialize with default configuration
    return {
      success: false,
      requiresUserInput: true,
      alternativeAction: 'Agent initialization failed. Please check your configuration and try again.',
    };
  }

  private async handlePlanningFailure(_error: AgentError, context: AgentContext): Promise<RecoveryResult> {
    // Try to create a simpler plan
    const simplifiedPlan: TaskPlan = {
      id: crypto.randomUUID(),
      objective: context.objective,
      steps: [
        {
          id: 'step-1',
          description: 'Gather information about the task',
          toolsRequired: ['search'],
          estimatedDuration: 60,
          status: 'pending',
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: 'step-2',
          description: 'Execute the main task',
          toolsRequired: [],
          estimatedDuration: 120,
          status: 'pending',
          retryCount: 0,
          maxRetries: 3,
        },
      ],
      dependencies: [],
      estimatedDuration: 180,
      created: new Date(),
    };

    return {
      success: true,
      newPlan: simplifiedPlan,
      requiresUserInput: false,
      alternativeAction: 'Created a simplified plan',
    };
  }

  private async handleToolSelectionFailure(_error: AgentError, context: AgentContext): Promise<RecoveryResult> {
    // Check if we have any fallback tools
    const fallbackTools = context.availableTools.filter((tool) => tool.capabilities.includes('general-purpose'));

    if (fallbackTools.length > 0) {
      return {
        success: true,
        requiresUserInput: false,
        alternativeAction: `Using fallback tool: ${fallbackTools[0].name}`,
      };
    }

    return {
      success: false,
      requiresUserInput: true,
      alternativeAction: 'No suitable tools found. User guidance needed.',
    };
  }

  private async handleToolExecutionFailure(error: AgentError, _context: AgentContext): Promise<RecoveryResult> {
    // Check if error is recoverable
    if (error.recoverable) {
      // Try with increased timeout or different parameters
      return {
        success: true,
        requiresUserInput: false,
        alternativeAction: 'Retrying with adjusted parameters',
      };
    }

    return {
      success: false,
      requiresUserInput: true,
      alternativeAction: 'Tool execution failed. Manual intervention may be required.',
    };
  }

  private async handleMemoryLimitExceeded(_error: AgentError, _context: AgentContext): Promise<RecoveryResult> {
    // Trigger memory summarization
    return {
      success: true,
      requiresUserInput: false,
      alternativeAction: 'Summarizing memory to free up space',
    };
  }

  private async handleObjectiveUnclear(_error: AgentError, _context: AgentContext): Promise<RecoveryResult> {
    // Always require user input for unclear objectives
    return {
      success: false,
      requiresUserInput: true,
      alternativeAction: 'Objective needs clarification from user',
    };
  }

  private async handleMaxRetriesExceeded(_error: AgentError, _context: AgentContext): Promise<RecoveryResult> {
    // No automatic recovery possible
    return {
      success: false,
      requiresUserInput: true,
      alternativeAction: 'Maximum retries exceeded. Please try a different approach.',
    };
  }

  private async handleUserInterventionRequired(error: AgentError, _context: AgentContext): Promise<RecoveryResult> {
    // By definition, requires user intervention
    return {
      success: false,
      requiresUserInput: true,
      alternativeAction: error.suggestedAction || 'User intervention required',
    };
  }

  private async handleContextOverflow(_error: AgentError, _context: AgentContext): Promise<RecoveryResult> {
    // Try to reduce context by summarizing
    return {
      success: true,
      requiresUserInput: false,
      alternativeAction: 'Reducing context size through summarization',
    };
  }

  private async handlePermissionDenied(_error: AgentError, _context: AgentContext): Promise<RecoveryResult> {
    // Always require user permission
    return {
      success: false,
      requiresUserInput: true,
      alternativeAction: 'Permission required to proceed',
    };
  }

  /**
   * Reset retry attempts for a specific error
   */
  resetRetryAttempts(errorKey?: string): void {
    if (errorKey) {
      this.retryAttempts.delete(errorKey);
    } else {
      this.retryAttempts.clear();
    }
  }
}

/**
 * Handles user intervention requests
 */
export class UserInterventionHandler {
  /**
   * Request user intervention for an error
   */
  async requestIntervention(request: UserGuidanceRequest): Promise<string> {
    const { sendChatMessage } = useChatStore.getState();

    // Format the guidance request as a chat message
    let message = `🤖 **Agent requires assistance**\n\n`;
    message += `**Error:** ${request.error.message}\n`;
    message += `**Question:** ${request.question}\n\n`;
    message += `**Options:**\n`;
    request.options.forEach((option, index) => {
      message += `${index + 1}. ${option}\n`;
    });

    if (request.defaultOption) {
      message += `\n*Default: ${request.defaultOption}*`;
    }

    // Send the message to chat
    await sendChatMessage(message, 'system');

    // In a real implementation, this would wait for user response
    // For now, we'll return the default option
    return request.defaultOption || request.options[0];
  }

  /**
   * Notify user of recovery action taken
   */
  notifyRecoveryAction(action: string): void {
    const { sendChatMessage } = useChatStore.getState();

    const message = `🔧 **Recovery Action:** ${action}`;
    sendChatMessage(message, 'system');
  }
}

/**
 * Main error recovery manager
 */
export class ErrorRecoveryManager {
  private strategy: ErrorRecoveryStrategy;
  private interventionHandler: UserInterventionHandler;

  constructor(
    strategy: ErrorRecoveryStrategy = new DefaultErrorRecoveryStrategy(),
    interventionHandler: UserInterventionHandler = new UserInterventionHandler()
  ) {
    this.strategy = strategy;
    this.interventionHandler = interventionHandler;
  }

  /**
   * Handle an agent error with recovery
   */
  async handleError(error: AgentError, context: AgentContext): Promise<RecoveryResult> {
    console.error('Agent error:', error);

    // First, try automatic recovery
    const recoveryResult = await this.strategy.attemptRecovery(error, context);

    if (recoveryResult.success) {
      // Notify user of successful recovery
      if (recoveryResult.alternativeAction) {
        this.interventionHandler.notifyRecoveryAction(recoveryResult.alternativeAction);
      }
      return recoveryResult;
    }

    // If automatic recovery failed and user input is required
    if (recoveryResult.requiresUserInput) {
      const guidanceRequest = this.strategy.requestUserGuidance(error);
      const userChoice = await this.interventionHandler.requestIntervention(guidanceRequest);

      // Process user choice
      const alternatives = this.strategy.suggestAlternatives(error);
      const selectedAlternative = alternatives.find((alt) => alt.description === userChoice);

      if (selectedAlternative) {
        return {
          success: true,
          requiresUserInput: false,
          alternativeAction: selectedAlternative.description,
        };
      }
    }

    return recoveryResult;
  }

  /**
   * Create an AgentError from a regular error
   */
  static createAgentError(
    error: Error | unknown,
    code: AgentErrorCode = AgentErrorCode.TOOL_EXECUTION_FAILED,
    recoverable = true
  ): AgentError {
    if (error instanceof AgentError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const context = error instanceof Error ? { stack: error.stack } : {};

    return new AgentError(message, code, recoverable, undefined, context);
  }
}

// Export singleton instance
export const errorRecoveryManager = new ErrorRecoveryManager();
