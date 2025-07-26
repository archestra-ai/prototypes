# Chat State Migration Plan: Removing Custom State Management

This document outlines the migration plan to remove custom state management from the chat implementation and fully embrace Vercel AI SDK v5's built-in capabilities.

## Current State Analysis

### What Can Be Replaced

#### 1. **useChatStore** - Entire Store Can Be Removed

The current chat store maintains:

- `chatHistory` - **Replace with**: Vercel AI SDK's `messages` from `useChat`
- `streamingMessageId` - **Replace with**: SDK's `status` state
- `abortController` - **Replace with**: SDK's `stop` function
- `sendChatMessage` - **Replace with**: SDK's `sendMessage`
- `cancelStreaming` - **Replace with**: SDK's `stop`
- `updateStreamingMessage` - **Not needed**: SDK handles streaming automatically

#### 2. **Custom Input Management in use-sse-chat**

- `customInput` state - **Replace with**: SDK's `input` and `setInput`
- `customError` state - **Replace with**: SDK's `error`
- `handleInputChange` - **Replace with**: SDK's `handleInputChange`
- `handleSubmit` - **Replace with**: SDK's `handleSubmit`

#### 3. **Tool Execution Flow**

Current implementation:

- Executes tools client-side after receiving from Ollama
- Manually manages tool call states
- Complex tool result handling

**Replace with** Vercel AI SDK pattern:

- Server-side tool execution with `execute` function
- Client-side tools with `onToolCall` callback
- Automatic tool state management via message parts

## Migration Steps

### Phase 1: Remove Custom State from use-sse-chat Hook

```typescript
// BEFORE: Custom hook with redundant state
export function useSSEChat(options?: UseSSEChatOptions) {
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState<Error | null>(null);
  // ... lots of custom logic
}

// AFTER: Clean wrapper around useChat
export function useSSEChat(options?: UseSSEChatOptions) {
  const { selectedModel } = useOllamaStore();
  const { isAgentActive } = useAgentStore();

  return useChat({
    transport: new DefaultChatTransport({
      api: `${ARCHESTRA_SERVER_API_URL}/chat`,
    }),
    body: {
      model: selectedModel,
      isAgentActive,
    },
    // Auto-submit when all tool results are available
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    ...options,
  });
}
```

### Phase 2: Migrate Tool Handling

#### Server-Side Tool Definition (Rust Backend)

```rust
// In the chat endpoint, define tools with execute functions
tools: {
  // MCP tools are executed server-side
  "mcp_server_tool": {
    description: "Execute MCP server tool",
    inputSchema: tool_schema,
    execute: async (args) => {
      // Execute MCP tool server-side
      let result = mcp_client.execute_tool(args).await?;
      return result;
    }
  }
}
```

#### Client-Side Tool Handling

```typescript
// In ChatInput or ChatPage
const chat = useSSEChat({
  // Handle client-side tools that need UI interaction
  onToolCall: async ({ toolCall }) => {
    // For tools requiring confirmation
    if (toolCall.toolName === 'askForConfirmation') {
      // Tool UI will be rendered via message parts
      // No need to handle here
      return;
    }

    // For auto-executed client tools
    if (toolCall.toolName === 'getLocation') {
      // Execute and add result without await
      addToolResult({
        tool: 'getLocation',
        toolCallId: toolCall.toolCallId,
        output: await getUserLocation(),
      });
    }
  },
});
```

### Phase 3: Update Message Rendering

```typescript
// BEFORE: Complex custom rendering with multiple passes
const renderAssistantMessage = useCallback((msg: any) => {
  // 200+ lines of complex logic
  // Multiple passes over parts
  // Manual tool state tracking
});

// AFTER: Clean part-based rendering
function MessageContent({ message }: { message: Message }) {
  return (
    <div className="message">
      {message.parts.map((part, index) => {
        switch (part.type) {
          case 'text':
            return <AIResponse key={index}>{part.text}</AIResponse>;

          case 'tool-call':
          case 'tool-result':
            return <ToolPart key={index} part={part} />;

          case 'reasoning':
            return <ReasoningDisplay key={index} content={part.text} />;

          // Tool-specific rendering
          case 'tool-askForConfirmation':
            return <ConfirmationTool key={index} part={part} />;

          default:
            return null;
        }
      })}
    </div>
  );
}
```

### Phase 4: Simplify Tool Components

```typescript
// Tool component for user interaction
function ConfirmationTool({ part }: { part: ToolPart }) {
  const { addToolResult } = useSSEChat();

  switch (part.state) {
    case 'input-streaming':
      return <div>Loading confirmation...</div>;

    case 'input-available':
      return (
        <div className="tool-confirmation">
          <p>{part.input.message}</p>
          <button onClick={() => addToolResult({
            tool: 'askForConfirmation',
            toolCallId: part.toolCallId,
            output: 'confirmed',
          })}>
            Confirm
          </button>
          <button onClick={() => addToolResult({
            tool: 'askForConfirmation',
            toolCallId: part.toolCallId,
            output: 'denied',
          })}>
            Deny
          </button>
        </div>
      );

    case 'output-available':
      return <div>Decision: {part.output}</div>;

    case 'output-error':
      return <div>Error: {part.errorText}</div>;
  }
}
```

### Phase 5: Remove useChatStore Completely

1. **Delete** `src/stores/chat-store.ts`
2. **Update imports** throughout the codebase to use `useSSEChat` directly
3. **Remove** all references to:
   - `useChatStore`
   - `sendChatMessage`
   - `clearChatHistory`
   - `cancelStreaming`
   - `useIsStreaming`

### Phase 6: Clean Up ChatInput

```typescript
// AFTER: Simplified ChatInput using SDK patterns
export default function ChatInput({ selectedTools = [] }: ChatInputProps) {
  const {
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
  } = useSSEChat();

  const { selectedModel } = useOllamaStore();

  return (
    <form onSubmit={handleSubmit}>
      <AIInput>
        <AIInputTextarea
          value={input}
          onChange={handleInputChange}
          disabled={isLoading}
          placeholder="What would you like to know?"
        />
        <AIInputSubmit
          status={isLoading ? 'streaming' : 'ready'}
          onClick={isLoading ? stop : undefined}
        />
      </AIInput>
    </form>
  );
}
```

## Benefits After Migration

1. **Reduced Code Complexity**
   - Remove ~500+ lines from chat-store.ts
   - Remove ~100+ lines from use-sse-chat.ts
   - Simplify ChatHistory by ~200+ lines

2. **Better Tool Integration**
   - Automatic tool state management
   - Built-in streaming support for tool calls
   - Type-safe tool parts

3. **Improved Performance**
   - No redundant state updates
   - No manual message parsing
   - Built-in optimizations from Vercel AI SDK

4. **Enhanced Developer Experience**
   - Less custom code to maintain
   - Better TypeScript support
   - Follows established patterns

## Implementation Timeline

1. **Week 1**: Phases 1-2 (Hook simplification and tool migration)
2. **Week 2**: Phases 3-4 (Message rendering and tool components)
3. **Week 3**: Phases 5-6 (Store removal and cleanup)
4. **Week 4**: Testing and documentation updates

## Backwards Compatibility

During migration, we can maintain backwards compatibility by:

1. Creating a compatibility layer that maps old store methods to new SDK methods
2. Gradually migrating components one by one
3. Running both systems in parallel during transition

## Testing Strategy

1. **Unit Tests**: Update all tests to use SDK mocks instead of store mocks
2. **Integration Tests**: Test tool execution flow end-to-end
3. **Visual Tests**: Ensure UI remains consistent
4. **Performance Tests**: Verify no regressions

## Conclusion

This migration will significantly simplify the chat implementation by removing redundant custom state management and fully embracing Vercel AI SDK v5's capabilities. The result will be cleaner, more maintainable code that follows established patterns and provides better performance.
