import type { UIMessage } from 'ai';

import { useAgentStore } from '@/stores/agent-store';
import { useChatStore } from '@/stores/chat-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import type { ChatMessage, ToolCallInfo } from '@/types';
import type { AgentContext, AgentUIMessage, ReasoningEntry, TaskProgress, ToolInfo } from '@/types/agent';

/**
 * State Bridge interfaces for synchronizing useChat hook with Zustand stores
 */
export interface StateBridge {
  syncMessageToZustand(message: UIMessage): void;
  syncAgentStateFromZustand(): AgentContext;
  handleToolExecution(toolCall: ToolCall): Promise<ToolCallInfo>;
}

interface ToolCall {
  toolCallId: string;
  toolName: string;
  args: any;
}

/**
 * Convert UIMessage to ChatMessage format for Zustand store
 */
export function convertUIMessageToChatMessage(uiMessage: UIMessage): ChatMessage {
  const message = uiMessage as any;
  const agentMessage = uiMessage as AgentUIMessage;

  // Extract text content from message parts
  let content = '';
  const toolCalls: ToolCallInfo[] = [];

  if (message.content) {
    if (typeof message.content === 'string') {
      content = message.content;
    } else if (Array.isArray(message.content)) {
      // Process message parts
      message.content.forEach((part: any) => {
        if (part.type === 'text') {
          content += part.text;
        } else if (part.type === 'tool-call') {
          toolCalls.push({
            id: part.toolCallId,
            serverName: '', // Will need to extract from tool name
            toolName: part.toolName,
            arguments: part.args || {},
            status: 'pending',
            startTime: new Date(),
          });
        }
      });
    }
  }

  return {
    id: message.id,
    role: message.role as string,
    content,
    timestamp: new Date(),
    isStreaming: false,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    isFromAgent: agentMessage.metadata?.isFromAgent,
    agentMetadata: agentMessage.metadata
      ? {
          planId: agentMessage.metadata.planId,
          stepId: agentMessage.metadata.stepId,
          isAgentGenerated: agentMessage.metadata.isFromAgent || false,
        }
      : undefined,
  };
}

/**
 * Convert ChatMessage to UIMessage format for useChat hook
 */
export function convertChatMessageToUIMessage(message: ChatMessage): AgentUIMessage {
  const parts: any[] = [];

  // Add text content
  if (message.content) {
    parts.push({
      type: 'text',
      text: message.content,
    });
  }

  // Add tool calls
  if (message.toolCalls) {
    message.toolCalls.forEach((toolCall: ToolCallInfo) => {
      parts.push({
        type: 'tool-call',
        toolCallId: toolCall.id,
        toolName: toolCall.toolName,
        args: toolCall.arguments,
      });
    });
  }

  const baseMessage: any = {
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    content: parts.length > 0 ? parts : message.content,
  };

  return {
    ...baseMessage,
    metadata: {
      agentMode: message.agentMetadata?.planId ? 'executing' : undefined,
      planId: message.agentMetadata?.planId,
      stepId: message.agentMetadata?.stepId,
      isFromAgent: message.isFromAgent,
    },
  } as AgentUIMessage;
}

/**
 * State Bridge implementation
 */
export class AgentStateBridge implements StateBridge {
  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Cleanup any resources if needed
  }

  /**
   * Sync a UIMessage from useChat to Zustand stores
   */
  syncMessageToZustand(message: UIMessage): void {
    const chatStore = useChatStore.getState();
    const agentStore = useAgentStore.getState();

    // Convert and add to chat history
    const chatMessage = convertUIMessageToChatMessage(message);
    const updatedHistory = [...chatStore.chatHistory, chatMessage];

    // Update chat store
    useChatStore.setState({
      chatHistory: updatedHistory,
    });

    // Extract and sync agent-specific data
    const agentMessage = message as AgentUIMessage;
    if (agentMessage.metadata?.isFromAgent) {
      // Update agent mode if changed
      if (agentMessage.metadata.agentMode && agentMessage.metadata.agentMode !== agentStore.mode) {
        agentStore.setAgentMode(agentMessage.metadata.agentMode);
      }

      // Process message parts for agent state updates
      const msg = message as any;
      if (msg.content && Array.isArray(msg.content)) {
        msg.content.forEach((part: any) => {
          if (part.type === 'data') {
            const data = part.data as any;

            // Handle reasoning updates
            if (data.type === 'reasoning' && data.entry) {
              agentStore.addReasoningEntry(data.entry);
            }

            // Handle task progress updates
            if (data.type === 'task-progress' && data.progress) {
              agentStore.updateProgress(data.progress);
            }
          }
        });
      }
    }
  }

  /**
   * Get current agent context from Zustand stores
   */
  syncAgentStateFromZustand(): AgentContext {
    const agentStore = useAgentStore.getState();
    const mcpStore = useMCPServersStore.getState();

    // Get available tools from MCP servers
    const allServers = [...mcpStore.installedMCPServers, mcpStore.archestraMCPServer];
    const availableTools: ToolInfo[] = allServers
      .filter((server: any) => server.status === 'connected')
      .flatMap((server: any) =>
        Object.entries(server.tools || {}).map(([name, tool]: [string, any]) => ({
          name,
          serverName: server.name,
          description: tool.description,
          capabilities: [], // Would need to extract from tool schema
          performance: {
            averageLatency: 100, // Default values
            successRate: 0.95,
          },
          requiresPermission: !agentStore.preferences.autoApproveServers.includes(server.name),
          schema: tool.inputSchema,
        }))
      );

    return {
      objective: agentStore.currentObjective || '',
      availableTools,
      workingMemory: agentStore.workingMemory,
      environmentState: {
        availableServers: allServers.map((s: any) => s.name),
        activeConnections: allServers.filter((s: any) => s.status === 'connected').length,
        resourceUsage: {
          memory: 0, // Would need actual metrics
          cpu: 0,
        },
        timestamp: new Date(),
      },
      userPreferences: {
        autoApproveTools: agentStore.preferences.autoApproveCategories as any,
        maxExecutionTime: 300000, // 5 minutes default
        preferredServers: [],
        reasoningVerbosity: agentStore.reasoningMode,
        interruptOnError: true,
      },
      sessionId: crypto.randomUUID(),
    };
  }

  /**
   * Handle tool execution through the agent store
   */
  async handleToolExecution(toolCall: ToolCall): Promise<ToolCallInfo> {
    const agentStore = useAgentStore.getState();

    // Create a tool call info object
    const toolCallInfo: ToolCallInfo = {
      id: toolCall.toolCallId,
      serverName: '', // Will be determined by the agent store
      toolName: toolCall.toolName,
      arguments: toolCall.args,
      status: 'pending',
      startTime: new Date(),
    };

    // Use the agent store's tool execution handler
    await agentStore.handleToolExecution(toolCallInfo);

    // Return the updated tool call info
    // In a real implementation, we'd get this from the store after execution
    return {
      ...toolCallInfo,
      status: 'completed',
      endTime: new Date(),
      executionTime: Date.now() - toolCallInfo.startTime.getTime(),
    };
  }
}

/**
 * Singleton instance of the state bridge
 */
export const stateBridge = new AgentStateBridge();

/**
 * Hook for using the state bridge in components
 */
export function useStateBridge() {
  return stateBridge;
}

/**
 * Extract reasoning entries from UIMessage parts
 */
export function extractReasoningFromMessage(message: UIMessage): ReasoningEntry[] {
  const reasoning: ReasoningEntry[] = [];
  const msg = message as any;

  if (msg.content && Array.isArray(msg.content)) {
    msg.content.forEach((part: any) => {
      if (part.type === 'data') {
        const data = part.data as any;
        if (data.type === 'reasoning' && data.entry) {
          reasoning.push(data.entry);
        }
      }
    });
  }

  return reasoning;
}

/**
 * Extract task progress from UIMessage parts
 */
export function extractTaskProgressFromMessage(message: UIMessage): TaskProgress | null {
  const msg = message as any;

  if (msg.content && Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if ((part as any).type === 'data') {
        const data = (part as any).data;
        if (data.type === 'task-progress' && data.progress) {
          return data.progress;
        }
      }
    }
  }

  return null;
}
