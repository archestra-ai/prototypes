# Missing `text-start` Event and Error Messages in ollama-ai-provider-v2 SSE Stream

Hi! First, thank you for creating and maintaining the ollama-ai-provider-v2 package. It's been really helpful for integrating Ollama with Vercel AI SDK.

## Issues

1. Missing `text-start` event before text streaming begins
2. Using `id: "0"` instead of proper message IDs
3. Getting error events between text deltas

## What I'm Getting

```json
data: {"type":"start"}
data: {"type":"start-step"}
data: {"type":"text-delta","id":"0","delta":"Hello"}
data: {"type":"error","errorText":"text part with id '0' not found"}
data: {"type":"text-delta","id":"0","delta":" world"}
data: {"type":"error","errorText":"text part with id '0' not found"}
```

## What Vercel AI SDK Expects

```json
data: {"type":"start"}
data: {"type":"start-step"}
data: {"type":"text-start","id":"msg_abc123"}
data: {"type":"text-delta","id":"msg_abc123","delta":"Hello"}
data: {"type":"text-delta","id":"msg_abc123","delta":" world"}
```

## Why This Matters

1. The Vercel AI SDK UI components don't work properly without the `text-start` event
2. The error messages ("text part with id '0' not found") appear to be related to the missing initialization
3. These errors clutter the stream and can confuse error handling logic

## Code Example

```typescript
import { streamText } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';

const ollama = createOllama({
  baseURL: 'http://localhost:11434/api',
});

const result = streamText({
  model: ollama('llama3.2:latest'),
  messages: [{ role: 'user', content: 'Hello' }],
});

// This returns a stream with missing text-start and error messages
const response = result.toUIMessageStreamResponse();
```

## Suggested Fix

1. Emit a `text-start` event with a generated ID (using `generateId()` from 'ai' package) before the first `text-delta`
2. Use that same ID for all subsequent `text-delta` events (not "0")
3. This should also resolve the "text part not found" errors

## Current Workaround

I'm having to:

- Transform the stream to inject the missing `text-start` event
- Filter out the "text part not found" error messages

But it would be great if the provider handled this natively.

Thanks again for your work on this package! Let me know if you need any more details or test cases.

## Environment

- ollama-ai-provider-v2: latest
- ai: 4.x
- Node.js: 20.x
