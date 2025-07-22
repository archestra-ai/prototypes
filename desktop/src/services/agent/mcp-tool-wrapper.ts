import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from '@openai/agents';
import { z } from 'zod';

import { useMCPServersStore } from '../../stores/mcp-servers-store';
import type { ConnectedMCPServer, ToolCallInfo } from '../../types';

// Sensitive tool patterns that require user approval
const SENSITIVE_TOOL_PATTERNS = [
  /^file_/i, // File operations
  /^write/i, // Write operations
  /^delete/i, // Delete operations
  /^system_/i, // System commands
  /^execute/i, // Code execution
  /^shell/i, // Shell commands
  /^run_/i, // Running commands
  /^install/i, // Installing packages
  /^modify/i, // Modifying files
  /^create/i, // Creating files/directories
  /^remove/i, // Removing files/directories
];

// Tool categories for auto-approval preferences
export type ToolCategory = 'file' | 'search' | 'read' | 'write' | 'execute' | 'system' | 'other';

interface MCPToolWrapper {
  tool: ReturnType<typeof tool>;
  mcpTool: Tool;
  serverName: string;
  category: ToolCategory;
}

/**
 * Determines if a tool is sensitive and requires approval
 */
export function isToolSensitive(toolName: string): boolean {
  return SENSITIVE_TOOL_PATTERNS.some((pattern) => pattern.test(toolName));
}

/**
 * Categorizes a tool based on its name and description
 */
export function categorizeeTool(toolName: string, description?: string): ToolCategory {
  const lowerName = toolName.toLowerCase();
  const lowerDesc = (description || '').toLowerCase();

  if (/^(file_|fs_)/.test(lowerName) || lowerDesc.includes('file')) {
    return 'file';
  }
  if (/^(search|find|query|list)/.test(lowerName) || lowerDesc.includes('search')) {
    return 'search';
  }
  if (/^(read|get|fetch|retrieve)/.test(lowerName) || lowerDesc.includes('read')) {
    return 'read';
  }
  if (/^(write|save|update|modify|create)/.test(lowerName) || lowerDesc.includes('write')) {
    return 'write';
  }
  if (/^(execute|run|shell|command)/.test(lowerName) || lowerDesc.includes('execute')) {
    return 'execute';
  }
  if (/^(system|os|env)/.test(lowerName) || lowerDesc.includes('system')) {
    return 'system';
  }

  return 'other';
}

/**
 * Converts MCP tool JSON schema to Zod schema
 * This is a simplified version that handles common cases
 */
function jsonSchemaToZod(schema: any): z.ZodType<any> {
  if (!schema) return z.any();

  switch (schema.type) {
    case 'object':
      if (schema.properties) {
        const shape: Record<string, z.ZodType<any>> = {};
        const required = schema.required || [];

        for (const [key, value] of Object.entries(schema.properties)) {
          const fieldSchema = jsonSchemaToZod(value as any);
          shape[key] = required.includes(key) ? fieldSchema : fieldSchema.optional();
        }

        return z.object(shape);
      }
      return z.record(z.any());

    case 'array':
      return z.array(jsonSchemaToZod(schema.items || {}));

    case 'string':
      let stringSchema = z.string();
      if (schema.minLength) stringSchema = stringSchema.min(schema.minLength);
      if (schema.maxLength) stringSchema = stringSchema.max(schema.maxLength);
      if (schema.pattern) stringSchema = stringSchema.regex(new RegExp(schema.pattern));
      return stringSchema;

    case 'number':
    case 'integer':
      let numberSchema = z.number();
      if (schema.minimum !== undefined) numberSchema = numberSchema.min(schema.minimum);
      if (schema.maximum !== undefined) numberSchema = numberSchema.max(schema.maximum);
      if (schema.type === 'integer') numberSchema = numberSchema.int();
      return numberSchema;

    case 'boolean':
      return z.boolean();

    case 'null':
      return z.null();

    default:
      return z.any();
  }
}

/**
 * Creates a wrapped tool for the OpenAI Agents SDK from an MCP tool
 */
export function createMCPToolWrapper(
  mcpTool: Tool,
  serverName: string,
  options?: {
    autoApprove?: boolean;
    customApprovalCheck?: (args: any) => Promise<boolean>;
  }
): MCPToolWrapper {
  const category = categorizeeTool(mcpTool.name, mcpTool.description);
  const isSensitive = isToolSensitive(mcpTool.name);

  // Create a unique tool name that includes the server name to avoid conflicts
  const uniqueToolName = `${serverName}_${mcpTool.name}`;

  // Convert JSON schema to Zod schema
  const parametersSchema = mcpTool.inputSchema ? jsonSchemaToZod(mcpTool.inputSchema) : z.object({});

  const wrappedTool = tool({
    name: uniqueToolName,
    description: `[${serverName}] ${mcpTool.description || `Execute ${mcpTool.name}`}`,
    parameters: parametersSchema as any,

    // Add approval requirement for sensitive tools
    needsApproval:
      isSensitive && !options?.autoApprove
        ? async (_, args) => {
            // If custom approval check is provided, use it
            if (options?.customApprovalCheck) {
              return !(await options.customApprovalCheck(args));
            }

            // Otherwise, always require approval for sensitive tools
            return true;
          }
        : undefined,

    // Execute the tool through MCP
    execute: async (args) => {
      const startTime = new Date();
      const toolCallInfo: ToolCallInfo = {
        id: `${uniqueToolName}_${Date.now()}`,
        serverName,
        toolName: mcpTool.name,
        arguments: args as Record<string, any>,
        status: 'executing',
        startTime,
      };

      try {
        // Execute through MCP servers store
        const result = await useMCPServersStore.getState().executeTool(serverName, {
          name: mcpTool.name,
          arguments: args as Record<string, any>,
        });

        toolCallInfo.status = 'completed';
        toolCallInfo.result = typeof result === 'string' ? result : JSON.stringify(result);
        toolCallInfo.endTime = new Date();
        toolCallInfo.executionTime = toolCallInfo.endTime.getTime() - startTime.getTime();

        return result;
      } catch (error) {
        toolCallInfo.status = 'error';
        toolCallInfo.error = error instanceof Error ? error.message : 'Unknown error';
        toolCallInfo.endTime = new Date();
        toolCallInfo.executionTime = toolCallInfo.endTime.getTime() - startTime.getTime();

        throw error;
      }
    },
  });

  return {
    tool: wrappedTool,
    mcpTool,
    serverName,
    category,
  };
}

/**
 * Extracts and wraps all tools from connected MCP servers
 */
export function extractToolsFromServers(
  servers: ConnectedMCPServer[],
  options?: {
    autoApproveCategories?: ToolCategory[];
    autoApproveServers?: string[];
    customApprovalCheck?: (serverName: string, toolName: string, args: any) => Promise<boolean>;
  }
): ReturnType<typeof tool>[] {
  const tools: ReturnType<typeof tool>[] = [];

  for (const server of servers) {
    if (server.status !== 'connected' || !server.tools) continue;

    const serverAutoApprove = options?.autoApproveServers?.includes(server.name);

    for (const mcpTool of server.tools) {
      const category = categorizeeTool(mcpTool.name, mcpTool.description);
      const categoryAutoApprove = options?.autoApproveCategories?.includes(category);

      const wrapper = createMCPToolWrapper(mcpTool, server.name, {
        autoApprove: serverAutoApprove || categoryAutoApprove,
        customApprovalCheck: options?.customApprovalCheck
          ? (args) => options.customApprovalCheck!(server.name, mcpTool.name, args)
          : undefined,
      });

      tools.push(wrapper.tool);
    }
  }

  return tools;
}

/**
 * Creates a tool selector that picks the best tool for a given task
 */
export function createToolSelector(wrappers: MCPToolWrapper[]) {
  return {
    /**
     * Find tools matching a capability
     */
    findToolsForCapability(capability: string): MCPToolWrapper[] {
      const lowerCapability = capability.toLowerCase();

      return wrappers.filter((wrapper) => {
        const name = wrapper.mcpTool.name.toLowerCase();
        const description = (wrapper.mcpTool.description || '').toLowerCase();

        return name.includes(lowerCapability) || description.includes(lowerCapability);
      });
    },

    /**
     * Get tools by category
     */
    getToolsByCategory(category: ToolCategory): MCPToolWrapper[] {
      return wrappers.filter((wrapper) => wrapper.category === category);
    },

    /**
     * Get tools from a specific server
     */
    getToolsByServer(serverName: string): MCPToolWrapper[] {
      return wrappers.filter((wrapper) => wrapper.serverName === serverName);
    },

    /**
     * Get all sensitive tools
     */
    getSensitiveTools(): MCPToolWrapper[] {
      return wrappers.filter((wrapper) => isToolSensitive(wrapper.mcpTool.name));
    },
  };
}

/**
 * Helper to store tool execution history for the agent
 */
export class ToolExecutionHistory {
  private history: ToolCallInfo[] = [];
  private maxHistorySize = 100;

  add(toolCall: ToolCallInfo) {
    this.history.push(toolCall);

    // Keep history size manageable
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  getRecentExecutions(count: number = 10): ToolCallInfo[] {
    return this.history.slice(-count);
  }

  getExecutionsByServer(serverName: string): ToolCallInfo[] {
    return this.history.filter((call) => call.serverName === serverName);
  }

  getExecutionsByTool(toolName: string): ToolCallInfo[] {
    return this.history.filter((call) => call.toolName === toolName);
  }

  getFailedExecutions(): ToolCallInfo[] {
    return this.history.filter((call) => call.status === 'error');
  }

  clear() {
    this.history = [];
  }
}
