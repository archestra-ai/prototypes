# AI SDK v5 Implementation Guide

This guide provides practical implementation patterns and code examples for working with Vercel AI SDK v5 in the Archestra AI codebase.

## Table of Contents

1. [Custom Ollama Provider Implementation](#custom-ollama-provider-implementation)
2. [Message Architecture](#message-architecture)
3. [Streaming Patterns](#streaming-patterns)
4. [Tool Integration](#tool-integration)
5. [State Management](#state-management)
6. [Testing Strategies](#testing-strategies)
7. [Common Pitfalls](#common-pitfalls)

## Custom Ollama Provider Implementation

Since `ollama-ai-provider` is not v5 compatible, we implement a custom provider:

```typescript
import { LanguageModelV2, LanguageModelV2StreamPart } from '@ai-sdk/provider';
import { Ollama } from 'ollama/browser';

private createCustomOllamaModel(modelName: string): LanguageModelV2 {
  const ollamaClient = new Ollama({ host: baseURL });

  return {
    specificationVersion: 'v2' as const,
    provider: 'ollama-custom',
    modelId: modelName,
    defaultObjectGenerationMode: 'tool' as const,

    async doStream(options: any): Promise<any> {
      // Convert messages to Ollama format
      const messages = options.prompt.map((msg: any) => ({
        role: msg.role,
        content: extractTextContent(msg.content),
      }));

      // Create streaming response
      const response = await ollamaClient.chat({
        model: modelName,
        messages,
        stream: true,
      });

      // Transform to v5 stream format
      return {
        stream: new ReadableStream<LanguageModelV2StreamPart>({
          async start(controller) {
            for await (const part of response) {
              controller.enqueue({
                type: 'delta',
                delta: { type: 'text-delta', text: part.message.content },
              });
            }
            controller.enqueue({ type: 'finish' });
            controller.close();
          }
        }),
        modelUsage: { /* usage stats */ },
      };
    }
  };
}
```

## Message Architecture

### UIMessage vs ModelMessage

```typescript
// UIMessage with metadata (for UI display)
interface AgentUIMessage extends UIMessage {
  metadata?: {
    agentMode?: AgentMode;
    planId?: string;
    stepId?: string;
    isFromAgent?: boolean;
  };
}

// Convert to ModelMessage (for AI processing)
function convertToModelMessage(uiMessage: UIMessage): ModelMessage {
  // Strip UI-specific metadata
  return {
    role: uiMessage.role,
    content: uiMessage.content,
    // Exclude metadata to save tokens
  };
}
```

### Custom Message Parts

```typescript
// Reasoning data part
interface ReasoningDataPart {
  type: 'data';
  data: {
    type: 'reasoning';
    entry: ReasoningEntry;
  };
}

// Task progress data part
interface TaskProgressDataPart {
  type: 'data';
  data: {
    type: 'task-progress';
    progress: TaskProgress;
  };
}

// Usage in streaming
function streamReasoningUpdate(entry: ReasoningEntry) {
  return {
    type: 'data',
    data: { type: 'reasoning', entry },
  };
}
```

## Streaming Patterns

### SSE Endpoint Implementation

```typescript
// API endpoint for SSE streaming
export async function POST(req: Request) {
  const { messages, agentContext } = await req.json();

  const result = await streamText({
    model: ollama('llama3.2'),
    messages: convertToModelMessages(messages),
    tools: agentContext.tools,
    onStepFinish: (step) => {
      // Handle task progress updates
    },
  });

  // Convert to SSE response
  return toUIMessageStreamResponse(result);
}
```

### Client-Side Integration with useChat

```typescript
const { messages, append, isLoading } = useChat({
  api: '/api/agent',
  onFinish: (message) => {
    // Sync to Zustand store
    syncToZustand(message);
  },
  experimental_prepareRequestBody: (messages) => ({
    messages: messages,
    agentContext: getAgentContext(),
  }),
});
```

## Tool Integration

### V5 Tool Wrapper Pattern

```typescript
function createMCPToolV5(mcpTool: MCPTool, serverName: string, callbacks?: ToolCallbacks): Tool {
  return tool({
    description: mcpTool.description,
    parameters: mcpTool.inputSchema || z.object({}),
    outputSchema: generateOutputSchema(mcpTool),

    execute: async (args) => {
      // Call onInputStart callback
      await callbacks?.onInputStart?.({ toolName: mcpTool.name, args });

      try {
        // Execute MCP tool
        const result = await executeMCPTool(serverName, mcpTool.name, args);

        // Call onInputDelta with result
        await callbacks?.onInputDelta?.({ result });

        return result;
      } catch (error) {
        // Proper error handling
        throw new ToolExecutionError(`Tool ${mcpTool.name} failed`, error);
      }
    },
  });
}
```

### Tool Approval Flow

```typescript
const tool = createMCPToolV5(mcpTool, serverName, {
  customApprovalCheck: async (args) => {
    // Check if tool requires approval
    const handler = (window as any).__toolApprovalHandler;
    if (!handler) return true;

    const requiresApproval = await handler.requiresApproval(toolName, serverName, args);

    if (requiresApproval) {
      const result = await handler.requestApproval(toolName, serverName, args, { description, metadata });
      return result.approved;
    }

    return true;
  },
});
```

## State Management

### Direct State Updates Pattern

**Update (2025-07-27)**: The State Bridge pattern has been removed. Instead, use direct updates from SSE data parts:

```typescript
// In use-sse-chat.ts hook
useEffect(() => {
  if (chat.messages.length > 0) {
    const lastMessage = chat.messages[chat.messages.length - 1];
    if (lastMessage?.parts) {
      lastMessage.parts.forEach((part: any) => {
        if (part.type === 'data' && part.data) {
          const { type: dataType, ...data } = part.data;

          if (dataType === 'agent-state') {
            const agentStore = useAgentStore.getState();
            if (data.mode) agentStore.setAgentMode(data.mode);
            if (data.objective) agentStore.setObjective(data.objective);
          } else if (dataType === 'reasoning') {
            const agentStore = useAgentStore.getState();
            agentStore.addReasoningEntry({
              id: crypto.randomUUID(),
              type: data.type || 'planning',
              content: data.content || '',
              timestamp: new Date(),
            });
          }
        }
      });
    }
  }
}, [chat.messages]);
```

### Zustand Store Integration

```typescript
export const useAgentStore = create<AgentStore>()(
  subscribeWithSelector((set, get) => ({
    // State
    mode: 'idle',
    useV5Implementation: true,

    // Actions
    activateAgent: async (objective: string) => {
      const agent = new ArchestraAgentV5({
        model: selectedModel,
        mcpTools: createV5Tools(),
        // ... config
      });

      set({ agentInstance: agent, mode: 'initializing' });

      // Execute with v5 streaming
      const result = await agent.execute(objective, context);
      // Streaming handled internally by v5
    },
  }))
);
```

## Testing Strategies

### Pure Unit Tests Pattern

```typescript
// agent-lifecycle-pure.test.ts
describe('Agent Lifecycle - Pure Logic Tests', () => {
  // Mock implementation without store dependencies
  class MockAgent {
    private state = { mode: 'idle' };

    setState(updates: Partial<State>) {
      this.state = { ...this.state, ...updates };
    }

    getState() {
      return { ...this.state };
    }
  }

  it('should transition states correctly', () => {
    const agent = new MockAgent();
    agent.setState({ mode: 'executing' });
    expect(agent.getState().mode).toBe('executing');
  });
});
```

### SSE Streaming Tests

```typescript
describe('SSE Streaming', () => {
  it('should parse SSE events correctly', () => {
    const parseSSE = (data: string) => {
      const lines = data.split('\n');
      const eventData = lines.find((line) => line.startsWith('data:'))?.substring(5);

      try {
        return JSON.parse(eventData || '');
      } catch {
        return null;
      }
    };

    const sseData = 'data: {"type":"text","content":"Hello"}\n\n';
    expect(parseSSE(sseData)).toEqual({
      type: 'text',
      content: 'Hello',
    });
  });
});
```

## Ollama Provider Implementation

### Custom Ollama Provider

Due to incompatibilities with third-party providers and our proxy setup, we use a custom implementation:

```typescript
// Our custom implementation that works with the proxy
const model = new OllamaProvider(modelName).createModel(modelName);

// This implementation:
// - Always uses the /chat endpoint (proxy doesn't support /generate)
// - Handles streaming correctly with the same format as ollama/browser
// - Supports both tool and non-tool calls
```

Note: We evaluated `ollama-ai-provider-v2` but found it incompatible with our proxy URL structure and streaming format requirements.

### Handling Multi-Step Execution

The `streamText` function makes multiple calls internally:

```typescript
// Be aware that streamText may call your model multiple times:
// 1. First call: With tools to determine what to execute
// 2. Second call: Without tools to generate final response

// Ensure your provider handles both scenarios:
async doStream(options: any): Promise<any> {
  const hasTools = options?.mode?.tools?.length > 0;

  // Your proxy might only support /chat endpoint
  // Handle both tool and non-tool calls appropriately
  const response = await ollamaClient.chat({
    model: modelName,
    messages,
    stream: true,
    ...(hasTools ? { tools: options.mode.tools } : {}),
  });
}
```

### Proxy Considerations

If using a proxy for Ollama:

1. **Endpoint Support**: Verify which endpoints your proxy supports
   - Standard Ollama: `/chat` and `/generate`
   - Some proxies: Only `/chat`

2. **Fallback Strategy**: Always use `/chat` if `/generate` is not supported

3. **Error Handling**: Handle 404 errors gracefully when endpoints are missing

## Common Pitfalls

### 2. Direct State Mutation in Tests

```typescript
// ❌ Wrong - Direct mutation
agent.getState().mode = 'executing';

// ✅ Correct - Use setter method
agent.setState({ mode: 'executing' });
```

### 3. Missing Stream Cleanup

```typescript
// ❌ Wrong - No cleanup
const stream = await agent.execute(objective);

// ✅ Correct - Proper cleanup
const controller = new AbortController();
try {
  const stream = await agent.execute(objective, {
    signal: controller.signal,
  });
} finally {
  controller.abort();
}
```

### 4. Incorrect Message Conversion

```typescript
// ❌ Wrong - UIMessage doesn't have content property in v5
expect(uiMessage.content).toBe('Hello');

// ✅ Correct - Content is in the internal structure
expect(uiMessage.role).toBe('user');
// Content is handled internally by the SDK
```

### 5. Manual Streaming Intervals

```typescript
// ❌ Wrong - v4 pattern
const interval = setInterval(() => {
  updateStreamingContent();
}, 100);

// ✅ Correct - v5 automatic streaming
const { messages } = useChat({
  api: '/api/agent',
  // Streaming handled automatically
});
```

## Best Practices

1. **Always use type-safe patterns**: Leverage TypeScript's type system
2. **Implement proper error boundaries**: Wrap v5 components with error handling
3. **Use streaming callbacks**: Implement onStepFinish for progress updates
4. **Test with mocks**: Avoid complex dependencies in unit tests
5. **Document decisions**: Keep architectural decision records up to date
6. **Monitor performance**: Use v5's built-in telemetry when available
7. **Plan for migration**: Keep compatibility layers during transition

## Resources

- [Vercel AI SDK v5 Documentation](https://sdk.vercel.ai)
- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Zustand Documentation](https://docs.pmnd.rs/zustand)

## Conclusion

AI SDK v5 provides significant improvements over v4, but requires careful implementation, especially when working with community providers. By following these patterns and avoiding common pitfalls, you can build robust, performant AI applications with proper streaming support and type safety.
