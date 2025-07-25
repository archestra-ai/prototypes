// import { useChat } from '@ai-sdk/react'; // Will be enabled when SSE endpoint is ready
import { useCallback, useState } from 'react';

import { AgentStateBridge } from '@/services/agent/state-bridge';
import { useAgentStore } from '@/stores/agent-store';

/**
 * Hook to integrate agent functionality with v5 useChat
 * Provides a bridge between the v5 chat interface and the agent store
 */
export function useAgentChat() {
  // TODO: Enable when SSE endpoint is ready
  // const chat = useChat({
  //   api: '/api/agent/chat',
  //   onError: (error) => {
  //     console.error('[useAgentChat] Error:', error);
  //   },
  //   onFinish: (message) => {
  //     console.log('[useAgentChat] Finished:', message);
  //   },
  // });

  const agentStore = useAgentStore();
  const [stateBridge] = useState(() => new AgentStateBridge());

  // Sync messages from v5 to Zustand when available
  // useEffect(() => {
  //   if (chat.messages && chat.messages.length > 0) {
  //     const lastMessage = chat.messages[chat.messages.length - 1];
  //     stateBridge.syncMessageToZustand(lastMessage);
  //   }
  // }, [chat.messages, stateBridge]);

  // Enhanced append with agent metadata
  const appendWithAgent = useCallback(
    async (
      content: string,
      _options?: {
        agentMode?: 'autonomous' | 'assistant';
        model?: string;
        tools?: string[];
      }
    ) => {
      // When v5 is ready
      // return chat.append({
      //   role: 'user',
      //   content,
      //   metadata: {
      //     isAgentActivation: true,
      //     agentMode: options?.agentMode || 'autonomous',
      //     model: options?.model,
      //     requestedTools: options?.tools,
      //   }
      // });

      // For now, just activate through store
      return agentStore.activateAgent(content);
    },
    [agentStore]
  );

  // Enhanced stop with cleanup
  const stopWithCleanup = useCallback(() => {
    // When v5 is ready
    // chat.stop();

    // Stop agent
    agentStore.stopAgent();
  }, [agentStore]);

  // Check if agent can be activated
  const canActivate = useCallback(
    (objective: string) => {
      return (
        objective.trim().length > 0 && !agentStore.isAgentActive && agentStore.mode === 'idle'
        // && !chat.isLoading // When v5 is ready
      );
    },
    [agentStore.isAgentActive, agentStore.mode]
  );

  return {
    // v5 chat properties (will be real when SSE is ready)
    messages: [],
    isLoading: false,
    error: null as Error | null,

    // Agent-specific methods
    appendWithAgent,
    stopWithCleanup,
    canActivate,

    // State bridge for v5 integration
    stateBridge,
  };
}

/**
 * Helper to extract agent status from v5 messages
 */
export function useAgentStatusFromMessages(messages: any[]): {
  isActive: boolean;
  currentObjective: string | null;
  mode: string;
} {
  // Look for agent activation in messages
  const activationMessage = messages.find((msg) => msg.role === 'user' && msg.metadata?.isAgentActivation);

  // Look for agent status in assistant messages
  const latestStatus = messages
    .filter((msg) => msg.role === 'assistant')
    .reverse()
    .find((msg) => msg.metadata?.agentStatus);

  return {
    isActive: !!activationMessage && !latestStatus?.metadata?.agentStatus?.completed,
    currentObjective: activationMessage?.content || null,
    mode: latestStatus?.metadata?.agentStatus?.mode || 'idle',
  };
}
