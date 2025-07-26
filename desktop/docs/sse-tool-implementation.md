# SSE Tool Implementation

## Overview

This document describes the SSE (Server-Sent Events) implementation with MCP tool support based on Vercel AI SDK v5 primitives.

## Architecture

### Backend (`src-tauri/src/gateway/api/agent/`)

1. **SSE Endpoint**: `/api/agent/chat`
   - Accepts POST requests with messages and optional tools
   - Streams responses using SSE protocol
   - Executes MCP tools server-side automatically

2. **Tool Flow**:

   ```
   Client Request → Ollama API → Tool Call Detection → MCP Proxy → Tool Result → SSE Stream
   ```

3. **SSE Events**:
   - `message_start`: Signals start of assistant message
   - `content_delta`: Streams text content
   - `tool_call_start`: Tool execution beginning
   - `tool_call_delta`: Tool arguments streaming
   - `tool_call_result`: Tool execution result
   - `message_complete`: Message finished with usage stats

### Frontend

1. **useSSEChat Hook** (`src/hooks/use-sse-chat.ts`):
   - Wraps Vercel AI SDK's `useChat`
   - Uses `DefaultChatTransport` for SSE
   - Supports `onToolCall` for client-side tools
   - Syncs with Zustand stores

2. **Tool Rendering** (`src/components/kibo/tool-part.tsx`):
   - Displays tool states: `input-streaming`, `input-available`, `output-available`, `output-error`
   - Shows tool arguments and results
   - Animated state transitions

3. **Message Parts**:
   - `text`: Regular message content
   - `tool-call`: Tool invocation
   - `tool-result`: Tool execution result
   - `reasoning`: Thinking/analysis content

## Tool Execution Patterns

### Server-Side Tools (Default)

- Executed automatically by the backend
- Results streamed via SSE
- No frontend intervention needed

### Client-Side Tools

- Use `onToolCall` callback in `useSSEChat`
- Call `addToolResult` to provide results
- Useful for browser-specific tools

### Tool Name Format

- Combined format: `serverName_toolName`
- Example: `filesystem_search-files`
- Automatically split for MCP proxy routing

## Usage Example

```typescript
const { sendMessage, messages, status } = useSSEChat({
  onToolCall: async ({ toolCall }) => {
    // Handle client-side tools
    console.log('Tool called:', toolCall);
  },
  onError: (error) => {
    console.error('SSE error:', error);
  },
});

// Send message with specific tools
await sendMessage('Search for agent files', {
  tools: ['filesystem_search-files'],
});
```

## Future Enhancements

1. **Unified Endpoint**: Merge chat and agent modes
2. **Tool Streaming**: Implement progressive tool results
3. **User Interaction Tools**: Add confirmation dialogs
4. **Tool Schemas**: Fetch actual schemas from MCP servers
5. **Performance**: Add request/response caching
