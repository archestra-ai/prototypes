# Vercel AI SDK v5 Stream Protocol

## Overview

The Vercel AI SDK v5 uses a specific Server-Sent Events (SSE) based stream protocol for communication between backend and frontend. This document outlines the protocol format and how to implement it correctly.

## Key Differences from v4

- v5 uses standard SSE format with `data:` prefix
- Each message is a JSON object with a `type` field
- Text content uses start/delta/end pattern with unique IDs
- Special `[DONE]` marker indicates stream termination
- Requires `x-vercel-ai-ui-message-stream: v1` header

## Message Format

All messages follow SSE format:

```
data: {"type":"<message-type>", ...other fields}

```

Note the empty line after each message (SSE requirement).

## Message Types

### Core Message Flow

1. **Message Start**

   ```
   data: {"type":"start","messageId":"unique-message-id"}

   ```

2. **Text Streaming** (start/delta/end pattern)

   ```
   data: {"type":"text-start","id":"text-block-id"}

   data: {"type":"text-delta","id":"text-block-id","delta":"Hello"}

   data: {"type":"text-delta","id":"text-block-id","delta":" world"}

   data: {"type":"text-end","id":"text-block-id"}

   ```

3. **Message Completion**

   ```
   data: {"type":"finish"}

   ```

4. **Stream Termination**

   ```
   data: [DONE]

   ```

### Tool Calling

1. **Tool Input Streaming**

   ```
   data: {"type":"tool-input-start","toolCallId":"call-id","toolName":"getWeather"}

   data: {"type":"tool-input-delta","toolCallId":"call-id","inputTextDelta":"San "}

   data: {"type":"tool-input-delta","toolCallId":"call-id","inputTextDelta":"Francisco"}

   data: {"type":"tool-input-available","toolCallId":"call-id","toolName":"getWeather","input":{"city":"San Francisco"}}

   ```

2. **Tool Output**

   ```
   data: {"type":"tool-output-available","toolCallId":"call-id","output":{"temperature":72,"condition":"sunny"}}

   ```

### Additional Message Types

- **Reasoning**: `reasoning-start`, `reasoning-delta`, `reasoning-end`
- **Sources**: `source-url`, `source-document`
- **Files**: `file` with url and mediaType
- **Custom Data**: `data-<custom-type>` pattern
- **Errors**: `error` with errorText
- **Steps**: `start-step`, `finish-step`

## Implementation Example

### Backend SSE Response

```rust
// Start message
"data: {\"type\":\"start\",\"messageId\":\"msg-123\"}\n\n"

// Text content
"data: {\"type\":\"text-start\",\"id\":\"text-123\"}\n\n"
"data: {\"type\":\"text-delta\",\"id\":\"text-123\",\"delta\":\"Hello\"}\n\n"
"data: {\"type\":\"text-delta\",\"id\":\"text-123\",\"delta\":\" world\"}\n\n"
"data: {\"type\":\"text-end\",\"id\":\"text-123\"}\n\n"

// Finish
"data: {\"type\":\"finish\"}\n\n"
"data: [DONE]\n\n"
```

### Required Headers

```
Content-Type: text/event-stream
Cache-Control: no-cache
x-vercel-ai-ui-message-stream: v1
```

## Current Implementation Issues

1. Our backend sends custom event types like `message_start`, `content_delta` instead of the required format
2. We're not using the start/delta/end pattern for text
3. Missing the `[DONE]` termination marker
4. Missing the `x-vercel-ai-ui-message-stream` header

## Migration Path

To fix our implementation:

1. Update SSE event format to use `data:` prefix only (no event names)
2. Implement text-start/text-delta/text-end pattern
3. Add proper message start and finish events
4. Add `[DONE]` termination
5. Add required header
