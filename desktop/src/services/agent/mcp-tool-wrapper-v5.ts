import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from 'ai';
import { z } from 'zod';

import { useMCPServersStore } from '@/stores/mcp-servers-store';

import { ToolCategory, categorizeeTool, isToolSensitive, jsonSchemaToZod } from './mcp-tool-wrapper-ai-sdk';

/**
 * Enhanced MCP Tool Wrapper for AI SDK v5
 * Adds outputSchema, streaming callbacks, and improved type inference
 */
export interface MCPToolV5 {
  tool: any; // Using any to avoid complex type issues
  mcpTool: Tool;
  serverName: string;
  category: ToolCategory;
  outputSchema?: z.ZodSchema;
  onInputStart?: (input: unknown) => void | Promise<void>;
  onInputDelta?: (delta: unknown) => void | Promise<void>;
}

/**
 * Tool execution options for v5
 */
export interface ToolExecutionOptionsV5 {
  autoApprove?: boolean;
  customApprovalCheck?: (args: any) => Promise<boolean>;
  onInputStart?: (input: unknown) => void | Promise<void>;
  onInputDelta?: (delta: unknown) => void | Promise<void>;
  onToolStart?: (toolName: string, args: any) => void;
  onToolComplete?: (toolName: string, result: any, duration: number) => void;
  onToolError?: (toolName: string, error: Error) => void;
}

/**
 * Extract output schema from MCP tool description or metadata
 * This is a heuristic approach - real implementation would need tool-specific schemas
 */
function generateOutputSchema(mcpTool: Tool): z.ZodSchema | undefined {
  // Check if tool has explicit output schema in metadata
  if ((mcpTool as any).outputSchema) {
    return jsonSchemaToZod((mcpTool as any).outputSchema);
  }

  // Heuristic: Generate schema based on tool name and description
  const toolName = mcpTool.name.toLowerCase();
  const description = mcpTool.description?.toLowerCase() || '';

  // File reading tools typically return string content
  if (toolName.includes('read') || toolName.includes('get') || toolName.includes('fetch')) {
    if (toolName.includes('file') || description.includes('file')) {
      return z.object({
        content: z.string(),
        path: z.string().optional(),
        size: z.number().optional(),
      });
    }
    // List operations typically return arrays
    if (toolName.includes('list') || description.includes('list')) {
      return z.array(z.string());
    }
  }

  // Write operations typically return success status
  if (toolName.includes('write') || toolName.includes('create') || toolName.includes('update')) {
    return z.object({
      success: z.boolean(),
      message: z.string().optional(),
      path: z.string().optional(),
    });
  }

  // Delete operations
  if (toolName.includes('delete') || toolName.includes('remove')) {
    return z.object({
      success: z.boolean(),
      message: z.string().optional(),
    });
  }

  // Search operations
  if (toolName.includes('search') || toolName.includes('find')) {
    return z.object({
      results: z.array(
        z.object({
          path: z.string().optional(),
          content: z.string().optional(),
          score: z.number().optional(),
        })
      ),
      total: z.number().optional(),
    });
  }

  // Default: return undefined to let the model infer
  return undefined;
}

/**
 * Create an enhanced v5 MCP tool wrapper with output schema and callbacks
 */
export function createMCPToolV5(mcpTool: Tool, serverName: string, options?: ToolExecutionOptionsV5): any {
  console.log('🚀 [createMCPToolV5] Creating v5 wrapper for tool:', {
    toolName: mcpTool.name,
    serverName,
    hasInputSchema: !!mcpTool.inputSchema,
    hasCallbacks: !!(options?.onInputStart || options?.onInputDelta),
  });

  const category = categorizeeTool(mcpTool.name, mcpTool.description);
  const isSensitive = isToolSensitive(mcpTool.name);

  // Convert schemas
  const inputSchema = mcpTool.inputSchema ? jsonSchemaToZod(mcpTool.inputSchema) : z.object({});
  const outputSchema = generateOutputSchema(mcpTool);

  console.log('📊 [createMCPToolV5] Schema analysis:', {
    hasInputSchema: !!mcpTool.inputSchema,
    hasOutputSchema: !!outputSchema,
    category,
    isSensitive,
  });

  // Create the v5 tool with enhanced features
  const wrappedTool = tool({
    description: `[${serverName}] ${mcpTool.description || `Execute ${mcpTool.name}`}`,
    inputSchema: inputSchema as any,
    outputSchema: outputSchema as any,

    // v5 callbacks for streaming tool execution
    onInputStart: options?.onInputStart
      ? async (callOptions) => {
          console.log('🎬 [MCPToolV5] Input started:', {
            toolName: mcpTool.name,
            options: callOptions,
          });
          await options.onInputStart?.(callOptions);
        }
      : undefined,

    onInputDelta: options?.onInputDelta
      ? async (callOptions) => {
          console.log('📝 [MCPToolV5] Input delta:', {
            toolName: mcpTool.name,
            delta: callOptions.inputTextDelta,
          });
          await options.onInputDelta?.(callOptions);
        }
      : undefined,

    execute: async (args: any) => {
      const startTime = Date.now();

      console.log('🔧 [MCPToolV5] Executing tool:', {
        name: mcpTool.name,
        server: serverName,
        args,
      });

      // Notify tool start
      options?.onToolStart?.(mcpTool.name, args);

      try {
        // Check approval if needed
        if (isSensitive && !options?.autoApprove && options?.customApprovalCheck) {
          const approved = await options.customApprovalCheck(args);
          if (!approved) {
            const error = new Error('Tool execution denied by user');
            options?.onToolError?.(mcpTool.name, error);
            throw error;
          }
        }

        // Execute through MCP store
        const result = await useMCPServersStore.getState().executeTool(serverName, {
          name: mcpTool.name,
          arguments: args as Record<string, any>,
        });

        const duration = Date.now() - startTime;

        console.log('✅ [MCPToolV5] Tool executed successfully:', {
          name: mcpTool.name,
          duration,
          hasResult: !!result,
        });

        // Notify completion
        options?.onToolComplete?.(mcpTool.name, result, duration);

        // Return result - if we have an output schema, it will be validated
        return result;
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error('Unknown error');

        console.error('❌ [MCPToolV5] Tool execution failed:', errorObj);

        // Notify error
        options?.onToolError?.(mcpTool.name, errorObj);

        throw errorObj;
      }
    },
  });

  return wrappedTool;
}


/**
 * Create a tool selector for v5 with enhanced filtering
 */
// Removed unused function

/**
 * Helper to create tool execution callbacks for agent integration
 */
export function createAgentToolCallbacks(
  onReasoningUpdate?: (reasoning: string) => void,
  onProgressUpdate?: (progress: { completed: number; total: number; currentTool?: string }) => void
): ToolExecutionOptionsV5 {
  let toolCount = 0;
  let completedTools = 0;

  return {
    onToolStart: (toolName, args) => {
      toolCount++;
      onProgressUpdate?.({
        completed: completedTools,
        total: toolCount,
        currentTool: toolName,
      });
      onReasoningUpdate?.(`Executing tool: ${toolName} with arguments: ${JSON.stringify(args)}`);
    },

    onToolComplete: (toolName, _result, duration) => {
      completedTools++;
      onProgressUpdate?.({
        completed: completedTools,
        total: toolCount,
      });
      onReasoningUpdate?.(`Tool ${toolName} completed in ${duration}ms`);
    },

    onToolError: (toolName, error) => {
      completedTools++;
      onProgressUpdate?.({
        completed: completedTools,
        total: toolCount,
      });
      onReasoningUpdate?.(`Tool ${toolName} failed: ${error.message}`);
    },

    onInputStart: (input) => {
      console.log('Tool input started:', input);
    },

    onInputDelta: (delta) => {
      console.log('Tool input delta:', delta);
    },
  };
}

// Re-export types and utilities from the original wrapper
export { ToolCategory, isToolSensitive } from './mcp-tool-wrapper-ai-sdk';
