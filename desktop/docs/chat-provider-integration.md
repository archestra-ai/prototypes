# Chat Provider Integration with Chat Store

## Overview

The application uses a hybrid approach combining:

1. **Vercel AI SDK v5's `useChat` hook** - For real-time streaming chat UI with built-in optimizations
2. **Chat Store (Zustand)** - For chat persistence, CRUD operations, and state management

## Architecture

### ChatProvider (Vercel AI SDK)

- **Purpose**: Handles real-time message streaming and UI state
- **Location**: `/src/providers/chat-provider.tsx`
- **Key Features**:
  - Uses `useChat` hook from `@ai-sdk/react`
  - Manages streaming state, message accumulation, and cancellation
  - Provides chat context to all child components
  - Handles metadata passing via global state pattern (due to v5 limitations)

### Chat Store (Zustand)

- **Purpose**: Manages persistent chat data and database operations
- **Location**: `/src/stores/chat-store.ts`
- **Key Features**:
  - CRUD operations for chats (create, read, update, delete)
  - Loads chat history from SQLite database
  - Manages current chat selection
  - Handles chat persistence during streaming

## Integration Pattern

### 1. Initial Message Loading

```typescript
// In ChatProvider
const { getCurrentChat } = useChatStore();
const currentChat = getCurrentChat();

// Convert persisted messages to Vercel AI SDK format
const initialMessages =
  currentChat?.interactions.map((interaction) => ({
    id: interaction.id,
    role: interaction.role,
    content: interaction.content,
    createdAt: new Date(interaction.created_at),
  })) || [];

// Initialize useChat with persisted messages
const chat = useChat({
  id: currentChat?.session_id || 'main-chat',
  initialMessages,
  transport: chatTransport,
  // ... other options
});
```

### 2. Message Persistence Flow

1. User sends message via ChatInput
2. ChatInput calls `sendMessage` from ChatProvider (for streaming)
3. ChatProvider streams response via `/api/chat/stream` endpoint
4. Backend persists messages during streaming via Ollama proxy interceptor
5. Chat store is updated via Tauri events or polling

### 3. Synchronization Strategy

- **On Chat Selection**: Load messages from store into provider
- **On New Message**: Let provider handle streaming, backend persists
- **On Chat Switch**: Clear provider messages, load new chat's messages
- **On Delete**: Update both store and provider state

## Key Considerations

### Why Both Systems?

1. **Vercel AI SDK** provides excellent streaming UX out of the box
2. **Chat Store** provides persistence and multi-chat management
3. Separation allows for clean concerns and easier testing

### Metadata Passing Pattern

Due to Vercel AI SDK v5's limitations, metadata (model, tools, agent context) is passed via a global variable pattern:

```typescript
// Global metadata storage
let globalMetadata: any = {};

// In prepareSendMessagesRequest
const body = {
  messages: messages,
  model: globalMetadata.model,
  tools: globalMetadata.tools,
  agent_context: globalMetadata.agent_context,
  stream: true,
};
```

### Tool Integration

Tools are passed as metadata and converted to the backend's expected format:

- Frontend: `selectedTools` from MCP store
- Metadata: `tools: selectedTools?.map(tool => \`${tool.serverName}_${tool.name}\`)`
- Backend: Parses and forwards to Ollama with proper tool schemas

## Implementation Checklist

When implementing chat features:

1. ✅ Always initialize ChatProvider with persisted messages from store
2. ✅ Ensure chat store is loaded before rendering ChatProvider
3. ✅ Handle chat switching by updating both store and provider
4. ✅ Let backend handle persistence during streaming
5. ✅ Use Tauri events for real-time updates (e.g., title changes)
6. ✅ Maintain single source of truth: database via chat store

## Common Pitfalls

1. **Don't** try to manually sync every message between provider and store
2. **Don't** persist messages from the frontend during streaming
3. **Don't** forget to clear provider state when switching chats
4. **Don't** bypass the metadata pattern for tool/model selection

## Future Improvements

1. Consider moving to a single state management solution when Vercel AI SDK v6 provides better integration options
2. Implement optimistic updates for better UX
3. Add offline support with sync queue
4. Improve error recovery and retry logic

## Merge Conflicts Resolution Status

### What Was Merged

This document was created after merging the `main` branch (with chat persistence fully implemented) into `feat/autonomous-agents` branch. The merge included:

1. **Chat Persistence**: Full CRUD operations for chats and messages
2. **Automatic Title Generation**: After 4 messages, LLM generates chat titles
3. **Dynamic Ollama Port**: Ollama now uses dynamically allocated ports instead of static
4. **Refactored Chat Store**: New implementation using direct Ollama SDK instead of provider pattern
5. **Database Schema**: Updated with proper CASCADE deletes and relationships

### Resolved Issues

1. ✅ Fixed `ToSchema` trait missing from `ChatWithInteractions` and related models
2. ✅ Updated `OLLAMA_SERVER_PORT` to use `get_ollama_server_port()` function
3. ✅ Added `trace` feature to `tower-http` dependency
4. ✅ Fixed tool name property: `tool.toolName` → `tool.name` in ChatInput
5. ✅ Accepted main branch versions of: `ollama.rs`, `chat-store.ts`, `ChatHistory`

### Remaining Tasks and Concerns

#### 1. ChatProvider Integration

**Status**: Not yet implemented
**Task**: Update ChatProvider to load initial messages from chat store

```typescript
// Needs implementation in chat-provider.tsx
const currentChat = getCurrentChat();
const initialMessages = currentChat?.interactions.map(...);
const chat = useChat({ initialMessages, ... });
```

#### 2. Tool Calling with qwen3

**Original Issue**: Tool-calling LLM (qwen3) doesn't recognize MCP tools
**Current Status**:

- Fixed tool name formatting in ChatInput
- Tools now sent as `${serverName}_${toolName}` format
- Need to verify if backend properly converts these to Ollama tool format
- Need to test with qwen3 model specifically

**What to Check**:

1. Verify `/api/chat/stream` endpoint properly handles tools array
2. Check `convert_tools_to_ollama_format` function works with new format
3. Test tool execution flow with qwen3 model
4. Verify tool schemas are properly fetched from MCP servers

#### 3. Frontend Integration Points

**ChatInput Component**:

- Currently imports `useChatContext` but main uses `useChatStore`
- Need to determine correct integration pattern
- May need to use both: store for persistence, context for streaming

**ChatHistory Component**:

- Main branch version uses `useChatStore` directly
- Lost agent-specific UI elements in merge
- Need to re-integrate agent mode indicators

#### 4. API Changes to Verify

1. **Chat CRUD Endpoints**: New REST endpoints at `/api/chat`
2. **Streaming Endpoint**: Still at `/api/chat/stream` but may have changes
3. **Tool Format**: Backend expects `serverName_toolName` format
4. **Database**: May need to drop and recreate due to schema changes

#### 5. Testing Checklist

- [ ] Create new chat and verify persistence
- [ ] Send message with tools selected and verify they're recognized
- [ ] Test with qwen3 model specifically for tool calling
- [ ] Verify chat title auto-generation after 4 messages
- [ ] Test chat deletion (should cascade delete messages)
- [ ] Verify streaming works with new chat store
- [ ] Test agent mode activation with tools
- [ ] Verify tool execution results are displayed correctly

#### 6. Potential Issues to Watch

1. **State Synchronization**: Two sources of truth (provider + store) may diverge
2. **Race Conditions**: Chat creation + first message timing
3. **Memory Leaks**: Event listeners for title updates need cleanup
4. **Tool Schema Caching**: May need to optimize repeated schema fetches
5. **Agent Context**: Verify agent metadata passes through correctly

#### 7. Database Migration Notes

Per the developer's comment:

- May need to drop `chats` and `chat_interactions` tables
- Or just drop entire local DB and let it recreate
- Located at: `~/Library/Application Support/com.archestra-ai.app/archestra.db` (macOS)

## Next Steps for Implementation

1. First, test if basic chat functionality works after merge
2. Then focus on tool calling issue with qwen3
3. Integrate ChatProvider with chat store for initial messages
4. Re-add agent-specific UI elements if needed
5. Comprehensive testing of all chat features

## Debug Commands

```bash
# Check if tools are being sent correctly
console.log('[ChatProvider] Preparing request body:', body);

# Monitor backend logs for tool processing
cd src-tauri && RUST_LOG=debug cargo run

# Check database state
pnpm dbstudio

# Test tool calling manually
curl -X POST http://localhost:54587/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "test"}],
    "model": "qwen3:4b",
    "tools": ["Everything_echo"],
    "stream": true
  }'
```
