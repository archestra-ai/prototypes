import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from 'ai';
import { z } from 'zod';

import { useMCPServersStore } from '../../stores/mcp-servers-store';

// Tool categorization and sensitivity patterns
export enum ToolCategory {
  SYSTEM = 'system',
  DATA = 'data',
  SECURITY = 'security',
  FILE = 'file',
  NETWORK = 'network',
  OTHER = 'other',
}

export interface ToolCallInfo {
  id: string;
  serverName: string;
  toolName: string;
  arguments: Record<string, any>;
  status: 'pending' | 'executing' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
  result?: any;
  error?: string;
  executionTime?: number;
}

export const SENSITIVE_TOOL_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /auth/i,
  /credentials/i,
  /write_file/i,
  /delete/i,
  /remove/i,
  /execute/i,
  /shell/i,
  /cmd/i,
  /system/i,
];

/**
 * MCPToolWrapper for Vercel AI SDK
 */
export interface MCPToolWrapperAISDK {
  tool: ReturnType<typeof tool>;
  mcpTool: Tool;
  serverName: string;
  category: ToolCategory;
}

/**
 * Convert JSON Schema to Zod schema
 */
export function jsonSchemaToZod(schema: any): z.ZodSchema {
  if (!schema || typeof schema !== 'object') {
    return z.object({});
  }

  // Handle the 'type' field
  if (schema.type === 'object') {
    const shape: Record<string, z.ZodSchema> = {};

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties as Record<string, any>)) {
        shape[key] = jsonSchemaToZod(propSchema);

        // Make optional if not in required array
        if (!schema.required || !schema.required.includes(key)) {
          shape[key] = shape[key].optional();
        }
      }
    }

    return z.object(shape);
  } else if (schema.type === 'string') {
    let zodString = z.string();
    if (schema.minLength) zodString = zodString.min(schema.minLength);
    if (schema.maxLength) zodString = zodString.max(schema.maxLength);
    if (schema.pattern) zodString = zodString.regex(new RegExp(schema.pattern));
    return zodString;
  } else if (schema.type === 'number' || schema.type === 'integer') {
    let zodNumber = schema.type === 'integer' ? z.number().int() : z.number();
    if (schema.minimum !== undefined) zodNumber = zodNumber.min(schema.minimum);
    if (schema.maximum !== undefined) zodNumber = zodNumber.max(schema.maximum);
    return zodNumber;
  } else if (schema.type === 'boolean') {
    return z.boolean();
  } else if (schema.type === 'array') {
    const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.any();
    return z.array(itemSchema);
  } else if (schema.type === 'null') {
    return z.null();
  }

  // Fallback for unknown types
  return z.any();
}

/**
 * Categorize a tool based on its name and description
 */
export function categorizeeTool(name: string, description?: string): ToolCategory {
  const combined = `${name} ${description || ''}`.toLowerCase();

  if (combined.includes('file') || combined.includes('read') || combined.includes('write')) {
    return ToolCategory.FILE;
  } else if (combined.includes('system') || combined.includes('os') || combined.includes('process')) {
    return ToolCategory.SYSTEM;
  } else if (combined.includes('network') || combined.includes('http') || combined.includes('api')) {
    return ToolCategory.NETWORK;
  } else if (combined.includes('auth') || combined.includes('security') || combined.includes('encrypt')) {
    return ToolCategory.SECURITY;
  } else if (combined.includes('data') || combined.includes('database') || combined.includes('query')) {
    return ToolCategory.DATA;
  }

  return ToolCategory.OTHER;
}

/**
 * Check if a tool is potentially sensitive based on its name
 */
export function isToolSensitive(name: string): boolean {
  return SENSITIVE_TOOL_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Create a Vercel AI SDK tool wrapper for an MCP tool
 */
export function createMCPToolWrapperAISDK(
  mcpTool: Tool,
  serverName: string,
  options?: {
    autoApprove?: boolean;
    customApprovalCheck?: (args: any) => Promise<boolean>;
  }
): MCPToolWrapperAISDK {
  console.log('🎁 [createMCPToolWrapperAISDK] Creating wrapper for tool:', {
    toolName: mcpTool.name,
    serverName,
    hasInputSchema: !!mcpTool.inputSchema,
    autoApprove: options?.autoApprove,
  });

  const category = categorizeeTool(mcpTool.name, mcpTool.description);
  const isSensitive = isToolSensitive(mcpTool.name);

  // Create a unique tool name that includes the server name to avoid conflicts
  const uniqueToolName = `${serverName}_${mcpTool.name}`;

  console.log('🔨 [createMCPToolWrapperAISDK] Converting input schema to Zod');
  // Convert JSON schema to Zod schema
  const parametersSchema = mcpTool.inputSchema ? jsonSchemaToZod(mcpTool.inputSchema) : z.object({});

  console.log('🏗️ [createMCPToolWrapperAISDK] Creating Vercel AI SDK tool');

  let wrappedTool: any;
  try {
    console.log('📋 [createMCPToolWrapperAISDK] Tool config:', {
      name: uniqueToolName,
      category,
      isSensitive,
      needsApproval: isSensitive && !options?.autoApprove,
    });

    wrappedTool = tool({
      description: `[${serverName}] ${mcpTool.description || `Execute ${mcpTool.name}`}`,
      inputSchema: parametersSchema as any,
      execute: async (args: any) => {
        const startTime = new Date();
        const toolCallInfo: ToolCallInfo = {
          id: `${uniqueToolName}_${Date.now()}`,
          serverName,
          toolName: mcpTool.name,
          arguments: args as Record<string, any>,
          status: 'executing',
          startTime,
        };

        console.log('🚀 [MCPToolWrapperAISDK] Executing tool:', {
          name: mcpTool.name,
          server: serverName,
          args,
        });

        try {
          // Check if approval is needed
          if (isSensitive && !options?.autoApprove && options?.customApprovalCheck) {
            const approved = await options.customApprovalCheck(args);
            if (!approved) {
              throw new Error('Tool execution denied by user');
            }
          }

          // Execute through MCP servers store
          const result = await useMCPServersStore.getState().executeTool(serverName, {
            name: mcpTool.name,
            arguments: args as Record<string, any>,
          });

          toolCallInfo.status = 'completed';
          toolCallInfo.result = typeof result === 'string' ? result : JSON.stringify(result);
          toolCallInfo.endTime = new Date();
          toolCallInfo.executionTime = toolCallInfo.endTime.getTime() - startTime.getTime();

          console.log('✅ [MCPToolWrapperAISDK] Tool executed successfully:', {
            name: mcpTool.name,
            executionTime: toolCallInfo.executionTime,
          });

          return result;
        } catch (error) {
          toolCallInfo.status = 'error';
          toolCallInfo.error = error instanceof Error ? error.message : 'Unknown error';
          toolCallInfo.endTime = new Date();
          toolCallInfo.executionTime = toolCallInfo.endTime.getTime() - startTime.getTime();

          console.error('❌ [MCPToolWrapperAISDK] Tool execution failed:', error);
          throw error;
        }
      },
    });

    console.log('✅ [createMCPToolWrapperAISDK] Vercel AI SDK tool created successfully');
  } catch (error) {
    console.error('❌ [createMCPToolWrapperAISDK] Error creating Vercel AI SDK tool:', error);
    throw error;
  }

  return {
    tool: wrappedTool,
    mcpTool,
    serverName,
    category,
  };
}

/**
 * Extract and wrap all tools from MCP servers for Vercel AI SDK
 */
export async function extractToolsFromServersAISDK(
  serverNames?: string[],
  options?: {
    autoApprove?: boolean;
    customApprovalCheck?: (toolName: string, args: any) => Promise<boolean>;
  }
): Promise<MCPToolWrapperAISDK[]> {
  const mcpStore = useMCPServersStore.getState();
  const allServers = [...mcpStore.installedMCPServers];
  if (mcpStore.archestraMCPServer.status === 'connected') {
    allServers.push(mcpStore.archestraMCPServer);
  }

  const serversToProcess = serverNames ? allServers.filter((s) => serverNames.includes(s.name)) : allServers;

  const wrappedTools: MCPToolWrapperAISDK[] = [];

  console.log(
    '📦 [extractToolsFromServersAISDK] Extracting tools from servers:',
    serversToProcess.map((s) => s.name)
  );

  for (const server of serversToProcess) {
    if (!server.tools || server.tools.length === 0) {
      console.log(`⏭️ [extractToolsFromServersAISDK] Server ${server.name} has no tools`);
      continue;
    }

    console.log(`🔧 [extractToolsFromServersAISDK] Processing ${server.tools.length} tools from ${server.name}`);

    for (const mcpTool of server.tools) {
      try {
        const wrapper = createMCPToolWrapperAISDK(mcpTool, server.name, {
          autoApprove: options?.autoApprove,
          customApprovalCheck: options?.customApprovalCheck
            ? (args) => options.customApprovalCheck!(mcpTool.name, args)
            : undefined,
        });
        wrappedTools.push(wrapper);
      } catch (error) {
        console.error(`❌ Failed to wrap tool ${mcpTool.name} from ${server.name}:`, error);
      }
    }
  }

  console.log(`✅ [extractToolsFromServersAISDK] Extracted ${wrappedTools.length} tools total`);
  return wrappedTools;
}

/**
 * Create a tool selector function for conditional tool inclusion
 */
export function createToolSelectorAISDK(
  criteria: {
    categories?: ToolCategory[];
    excludeCategories?: ToolCategory[];
    serverNames?: string[];
    excludeServerNames?: string[];
    toolNames?: string[];
    excludeToolNames?: string[];
    onlySensitive?: boolean;
    excludeSensitive?: boolean;
  } = {}
): (wrapper: MCPToolWrapperAISDK) => boolean {
  return (wrapper: MCPToolWrapperAISDK) => {
    const { mcpTool, serverName, category } = wrapper;
    const isSensitive = isToolSensitive(mcpTool.name);

    // Apply filters
    if (criteria.categories && !criteria.categories.includes(category)) {
      return false;
    }

    if (criteria.excludeCategories && criteria.excludeCategories.includes(category)) {
      return false;
    }

    if (criteria.serverNames && !criteria.serverNames.includes(serverName)) {
      return false;
    }

    if (criteria.excludeServerNames && criteria.excludeServerNames.includes(serverName)) {
      return false;
    }

    if (criteria.toolNames && !criteria.toolNames.includes(mcpTool.name)) {
      return false;
    }

    if (criteria.excludeToolNames && criteria.excludeToolNames.includes(mcpTool.name)) {
      return false;
    }

    if (criteria.onlySensitive !== undefined && criteria.onlySensitive !== isSensitive) {
      return false;
    }

    if (criteria.excludeSensitive && isSensitive) {
      return false;
    }

    return true;
  };
}
