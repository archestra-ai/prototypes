# Chat State Sharing Issue - 2025-07-27 [RESOLVED]

## Problem Description

After removing the state-bridge and updating to use Vercel AI SDK v5's `useChat` hook directly, chat messages were not being shared between components even though they all used the same chat ID.

### Symptoms

1. **Messages are received**: The `useSSEChat` hook logs show messages being received (count goes from 0 → 1 → 2)
2. **ChatHistory shows empty**: The ChatHistory component consistently shows 0 messages
3. **Multiple hook instances**: Components seem to have separate chat instances despite using the same `id: 'main-chat'`

## Current Implementation

### Hook Setup (use-sse-chat.ts)

```typescript
export function useSSEChat(options?: UseSSEChatOptions) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${ARCHESTRA_SERVER_API_URL}/chat`,
      }),
    []
  );

  const chat = useChat({
    id: 'main-chat',
    transport,
    // ... callbacks
  });

  return chat;
}
```

### Component Usage

- `ChatHistory`: Uses `const chat = useSSEChat();`
- `ChatInput`: Uses `const { sendMessage, status, stop, setMessages } = useSSEChat();`
- `DebugChat`: Uses `const chat = useSSEChat();`

## Attempted Solutions

1. **Shared Transport Instance**: Created a single transport instance outside the hook - didn't work
2. **useMemo for Transport**: Used useMemo to ensure stable transport per hook instance - didn't work
3. **Direct API Property**: Tried using `api` property directly (not valid in v5)
4. **Chat Provider Context**: Started implementing but reverted as v5 should handle this automatically

## Possible Causes

### 1. Transport Instance Issue

Each `useSSEChat()` call creates its own transport instance via `useMemo`. While stable per component, different components still get different transports. This might prevent state sharing.

### 2. React Rendering Timing

Components might be mounting at different times or in different React trees, causing them to not share the same internal chat state.

### 3. V5 SDK Behavior

The v5 SDK might require a specific pattern for state sharing that we're not following correctly. The documentation mentions using the same `id` should work, but there might be additional requirements.

### 4. Backend Integration

The chat is connecting to the backend and receiving messages, but the state updates might not be propagating correctly to all hook instances.

## Next Steps to Try

### Option 1: Single useChat Call

Instead of wrapping `useChat` in a custom hook, call it once at the top level and pass it down via props or context.

### Option 2: Check V5 Examples

Look for official v5 examples of sharing chat state between multiple components.

### Option 3: Debug Internal State

Add more logging to understand if:

- All components are getting the same chat instance
- The messages array is the same reference
- State updates are triggering re-renders

### Option 4: Simplify Architecture

Consider having a single component manage the chat and pass callbacks/state down, rather than having multiple components independently access the chat.

## Impact

This issue prevents the chat UI from displaying messages, making the application unusable for its primary purpose. The backend integration works (messages are sent and received), but the frontend state management is broken.

## Resolution

### Root Cause

The issue was that each component calling `useSSEChat()` was getting its own instance of the `useChat` hook, even though they used the same ID. The Vercel AI SDK v5's `useChat` hook doesn't automatically share state between multiple instances based on ID alone.

### Solution Implemented

Created a `ChatProvider` that calls `useChat` once and shares the instance via React Context:

```typescript
// /src/providers/chat-provider.tsx
const chatTransport = new DefaultChatTransport({
  api: `${ARCHESTRA_SERVER_API_URL}/chat`,
});

const ChatContext = createContext<ReturnType<typeof useChat> | null>(null);

export function ChatProvider({ children }: ChatProviderProps) {
  const chat = useChat({
    id: 'main-chat',
    transport: chatTransport,
  });

  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within ChatProvider');
  }
  return context;
}
```

### Changes Made

1. **Created ChatProvider** (`/src/providers/chat-provider.tsx`):
   - Single `useChat` instance shared via React Context
   - Transport instance created once outside component
   - Includes agent-specific data processing logic

2. **Updated ChatPage** (`/src/pages/ChatPage/index.tsx`):
   - Wrapped content with `<ChatProvider>`

3. **Updated Components**:
   - `ChatHistory`: Changed from `useSSEChat()` to `useChatContext()`
   - `ChatInput`: Changed from `useSSEChat()` to `useChatContext()`
   - `DebugChat`: Changed from `useSSEChat()` to `useChatContext()`
   - `AgentControlPanel`: Changed from `useSSEChat()` to `useChatContext()`

4. **Kept useSSEChat Hook**: The original hook remains for potential future use or for components outside the ChatProvider context.

### Result

All components now share the same chat state. Messages sent from ChatInput are immediately visible in ChatHistory and DebugChat.

## Related Files

- `/src/providers/chat-provider.tsx` - New ChatProvider with shared useChat instance
- `/src/hooks/use-sse-chat.ts` - Original custom hook (kept for backwards compatibility)
- `/src/pages/ChatPage/ChatHistory/index.tsx` - Updated to use useChatContext
- `/src/pages/ChatPage/ChatInput/index.tsx` - Updated to use useChatContext
- `/src/pages/ChatPage/DebugChat.tsx` - Updated to use useChatContext
- `/src/components/agent/AgentControlPanel.tsx` - Updated to use useChatContext
