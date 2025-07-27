# Model Selection Implementation in Vercel AI SDK v5

This document describes how model selection is implemented in the chat interface using Vercel AI SDK v5.

## Problem

In Vercel AI SDK v5, the traditional approach of passing dynamic data (like model selection) to the backend has changed. The `body` parameter in `useChat` is fixed at initialization time and doesn't update with component state changes.

## Solution

We use the `prepareSendMessagesRequest` function in `DefaultChatTransport` along with a global variable pattern to pass dynamic metadata.

### Implementation Details

#### 1. Global Metadata Storage

```typescript
// Store metadata outside component to ensure it persists
let globalMetadata: any = {};
```

This global variable stores the current model selection and other metadata that needs to be sent with each request.

#### 2. Transport Configuration

```typescript
const chatTransport = useMemo(() => {
  return new DefaultChatTransport({
    api: `${ARCHESTRA_SERVER_API_URL}/chat`,
    prepareSendMessagesRequest: ({ messages }) => {
      // Build the request body with messages and metadata
      const body = {
        messages: messages,
        model: globalMetadata.model,
        tools: globalMetadata.tools,
        agent_context: globalMetadata.agent_context,
        stream: true,
      };

      return { body };
    },
  });
}, []);
```

The `prepareSendMessagesRequest` function is called before each request and merges the global metadata into the request body.

#### 3. Metadata Capture

```typescript
const sendMessage = useCallback(
  (content: any) => {
    if (typeof content === 'object' && content.metadata) {
      // Update global metadata
      globalMetadata = {
        model: content.metadata.model,
        tools: content.metadata.tools,
        agent_context: content.metadata.agent_context,
      };
    }
    return chat.sendMessage(content);
  },
  [chat.sendMessage]
);
```

We override the `sendMessage` function to capture metadata before sending and update the global variable.

#### 4. Usage in ChatInput

```typescript
const body: any = {
  model: selectedModel,
  tools: selectedTools?.map((tool) => `${tool.serverName}_${tool.toolName}`) || [],
};

const result = await sendMessage({
  text: trimmedInput,
  metadata: body,
});
```

The ChatInput component passes the selected model as metadata when calling `sendMessage`.

## Backend Integration

The backend expects the model at the top level of the request:

```rust
#[derive(Debug, Deserialize)]
struct ChatRequest {
    messages: Vec<ChatMessage>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    tools: Option<Vec<String>>,
    // ... other fields
}
```

If no model is provided, it defaults to "llama3.2":

```rust
let ollama_request = OllamaChatRequest {
    model: request.model.unwrap_or_else(|| "llama3.2".to_string()),
    // ... other fields
};
```

## Why This Pattern?

This pattern is necessary due to the v5 architecture:

1. **Transport Configuration is Static**: The `DefaultChatTransport` is configured once and doesn't have access to React component state.
2. **No Dynamic Body Option**: Unlike v4, the `body` parameter can't be a function that reads current state.
3. **Metadata Pass-through**: The `sendMessage` metadata is available in the transport but not automatically merged into the request body.

## Alternative Approaches Considered

1. **`experimental_prepareRequestBody`**: This API is no longer available in v5.
2. **`body` parameter in `useChat`**: This gets fixed at initialization and doesn't update.
3. **Custom Transport**: Would be more complex and require reimplementing DefaultChatTransport functionality.

## References

- [GitHub Issue #6386](https://github.com/vercel/ai/issues/6386) - Discussion about the body parameter limitation
- [Vercel AI SDK v5 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#usechat-changes)
