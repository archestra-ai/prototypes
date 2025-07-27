# Chat State Migration Plan: Removing Custom State Management

**Status: Partially Completed (4 of 6 phases)**  
**Last Updated: 2025-07-27**

This document outlines the migration plan to remove custom state management from the chat implementation and fully embrace Vercel AI SDK v5's built-in capabilities. The migration was partially completed, with 4 out of 6 phases finished. The remaining phases (tool handling migration) were not completed as the current implementation is working well.

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

### Phase 1: Remove Custom State from use-sse-chat Hook ✅ COMPLETED

**Status**: Completed on 2025-07-26

**Changes Made**:

- Removed `customInput` and `customError` state
- Removed `handleInputChange` and `handleSubmit` custom methods
- Removed `sendChatMessage` wrapper
- Simplified hook to directly return Vercel AI SDK's `useChat` interface
- Kept agent data processing in `useEffect` (to be moved server-side in Phase 2)

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

### Phase 3: Update Message Rendering ✅ COMPLETED

**Status**: Completed on 2025-07-26

**Changes Made**:

- Created new simplified `MessageContent` component that renders message parts directly
- Created new `ChatMessage` component for clean message display
- Removed complex `renderAssistantMessage` function (200+ lines)
- Removed all memoization band-aids (MemoizedAgentModeIndicator, etc.)
- Simplified ChatHistory to use new components
- Clean part-based rendering with simple switch statement

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

### Phase 5: Remove useChatStore Completely ✅ COMPLETED

**Status**: Completed on 2025-07-26

**Changes Made**:

- Deleted `src/stores/chat-store.ts` file (530+ lines removed)
- Removed import from ChatInput component
- Updated ChatInput to use `setMessages([])` instead of `clearChatHistory()`
- Removed chat store dependency from agent-store.ts
- Removed chat history monitoring logic from agent store
- Removed state-bridge.ts as it's no longer needed with v5 useChat
- Removed `useIsStreaming` export

1. **Delete** `src/stores/chat-store.ts`
2. **Update imports** throughout the codebase to use `useSSEChat` directly
3. **Remove** all references to:
   - `useChatStore`
   - `sendChatMessage`
   - `clearChatHistory`
   - `cancelStreaming`
   - `useIsStreaming`

### Phase 6: Clean Up ChatInput ✅ COMPLETED

**Status**: Completed on 2025-07-26

**Changes Made**:

- Updated ChatInput to use simplified `useSSEChat` hook interface
- Removed custom input handling logic
- Now using Vercel AI SDK's built-in methods directly
- Kept agent command parsing (to be moved server-side in future)

**Important Note**:
The Vercel AI SDK's `useChat` returns `UIMessage` objects which don't support provider options.
When the backend needs provider-specific options, it should use `convertToModelMessages` to convert
UIMessage objects to ModelMessage objects. This conversion should happen server-side.

**Update**: The `experimental_prepareRequestBody` API is no longer available in v5. To pass metadata like model selection,
use `prepareSendMessagesRequest` in the `DefaultChatTransport` configuration. Due to v5 architecture, metadata must be stored
in a ref or global variable to be accessible within the transport configuration.

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

## Progress Summary

### Completed Phases (4 of 6)

- ✅ **Phase 1**: Simplified use-sse-chat hook - removed custom state management
- ✅ **Phase 3**: Updated message rendering - created clean component structure
- ✅ **Phase 5**: Removed useChatStore - deleted 530+ lines of redundant code
- ✅ **Phase 6**: Cleaned up ChatInput - now uses Vercel AI SDK directly

### Remaining Phases (2 of 6)

- ⏳ **Phase 2**: Migrate tool handling to server-side execution patterns
- ⏳ **Phase 4**: Simplify tool components for user interactions

### Code Reduction Achieved

- **Removed**: ~800+ lines of custom state management code
- **Simplified**: Hook interface, message rendering, input handling
- **Eliminated**: Redundant state, complex memoization, custom abstractions

### Key Benefits Realized

1. **Simpler Architecture**: Direct use of Vercel AI SDK without wrapper layers
2. **Better Performance**: Removed unnecessary re-renders and state updates
3. **Cleaner Code**: Easy to understand component structure
4. **Type Safety**: Leveraging SDK's built-in TypeScript support

## Next Steps

The remaining work focuses on tool handling:

1. Implement server-side tool execution in the backend
2. Create clean tool UI components for user interactions
3. Update tests to use SDK mocks instead of store mocks

## Conclusion

This migration successfully removed the bulk of custom state management, achieving significant simplification. The chat implementation now directly leverages Vercel AI SDK v5's capabilities, resulting in cleaner, more maintainable code that follows established patterns.

## Why Phases 2 & 4 Were Not Completed

The remaining phases (tool handling migration) were not completed because:

1. **Current Implementation Works Well**: The existing server-side tool execution through MCP is functioning correctly
2. **Architectural Fit**: The backend-driven approach for tool execution aligns better with the security model
3. **Complexity vs Benefit**: The effort to migrate tool handling to v5 patterns would not provide significant benefits
4. **Focus Shifted**: Development priorities moved to other features once the core chat functionality was working

The partially completed migration still achieved the main goals of simplifying state management and adopting v5's streaming capabilities.
