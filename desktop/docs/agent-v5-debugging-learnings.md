# Agent V5 Debugging Learnings

## Overview

This document captures the learnings from debugging the 404 error that occurred when using the V5 agent implementation with Vercel AI SDK's `streamText` function.

## The Issue

When executing agent commands, we encountered a 404 error after the initial successful execution:

- First call: V5 agent executes successfully with 26 tools
- Second call: CustomOllama is called with `hasTools: false` and `toolsCount: 0`, resulting in 404 error

## Root Cause Analysis

### 1. streamText Multi-Step Behavior

The Vercel AI SDK's `streamText` function makes multiple internal calls to the model:

```typescript
// From streamText source (lines 1395-1428)
if (
  clientToolCalls.length > 0 &&
  clientToolOutputs.length === clientToolCalls.length &&
  !(await isStopConditionMet({ stopConditions, steps: recordedSteps }))
) {
  // Continues with another step after tool execution
  await streamStep({
    currentStep: currentStep + 1,
    responseMessages,
    usage: combinedUsage,
  });
}
```

**Key Learning**: `streamText` automatically handles multi-step tool execution:

1. First call: Determines which tools to call (with tools in config)
2. After tool execution: Makes another call to generate the final response (often without tools)

### 2. Ollama Proxy Limitations

Our Ollama proxy only supports specific endpoints:

- ✅ `/chat` endpoint (with and without tools)
- ❌ `/generate` endpoint (returns 404)

This differs from standard Ollama which supports both endpoints.

### 3. Custom Implementation Issues

Our initial custom Ollama implementation tried to use different endpoints based on tool availability:

```typescript
// Initial approach (didn't work)
if (ollamaTools.length === 0) {
  response = await ollamaClient.generate(...); // 404 error
} else {
  response = await ollamaClient.chat(...); // Works
}
```

## Solutions Attempted

### 1. Using ollama-ai-provider-v2

We attempted to use the `ollama-ai-provider-v2` package (v1.0.0-alpha.3) which supports:

- Tool streaming
- Reasoning support
- AI SDK v5 compatibility

**Issue**: The package wasn't respecting our proxy URL configuration and tried to connect directly to `http://127.0.0.1:11434` instead of our proxy.

**Correct Usage**:

```typescript
import { createOllama } from 'ollama-ai-provider-v2';

const ollamaProvider = createOllama({
  baseURL: 'http://localhost:54587/llm/ollama', // Without /api suffix
  compatibility: 'compatible',
});
```

### 2. Custom Implementation Fix

We modified our custom implementation to always use the `/chat` endpoint:

```typescript
// Always use chat endpoint since our proxy doesn't support /generate
response = await ollamaClient.chat({
  model: modelName,
  messages,
  stream: true,
  ...(ollamaTools.length > 0 ? { tools: ollamaTools } : {}),
  options: {
    /* ... */
  },
});
```

## Key Discoveries

### 1. Duplicate Agent Initialization

Found and fixed duplicate agent initialization in `initializeAgentStore` (lines 746-809) that was creating a second agent instance on startup.

### 2. Circular Dependency

Fixed circular call issue in `sendAgentMessage` that was calling `sendChatMessage`, creating an infinite loop.

### 3. Model Capabilities

The `ModelCapabilities` class correctly identifies tool support, but the issue was with how tools were passed in subsequent `streamText` calls.

## Best Practices Learned

### 1. Understanding streamText Behavior

- `streamText` manages its own multi-step execution flow
- Tools configuration needs to be consistent across all steps
- The function will make additional calls after tool execution

### 2. Proxy Compatibility

- Always verify which endpoints your proxy supports
- Don't assume standard Ollama API compatibility
- Test both tool and non-tool scenarios

### 3. Provider Package Selection

- Check if provider packages respect custom baseURL configurations
- Understand the difference between default exports and factory functions
- Use `createOllama` with custom config instead of the default `ollama` export

### 4. Debugging Approach

- Add detailed logging at model provider level
- Track the full execution flow, not just the initial call
- Use stack traces to understand where calls originate

## Current Solution

The working solution uses:

1. **Custom implementation** that always uses `/chat` endpoint
2. **Proper handling** of both tool and non-tool calls through the same endpoint
3. **Removed ollama-ai-provider-v2** due to incompatibilities with our proxy and streaming format

### Additional Discovery: Architecture Inconsistency

We discovered that the chat-store uses the Ollama browser client directly, while the agent system uses our ModelProvider abstraction. This creates an inconsistency:

- Non-agent chat: `ollama/browser` client → works correctly
- Agent chat: ModelProvider with ollama-ai-provider-v2 → streaming format differences

This needs to be addressed by either:

1. Updating chat-store to use ModelProvider (unified approach)
2. Ensuring ollama-ai-provider-v2 has the same streaming format as ollama/browser

## Future Considerations

1. **Proxy Enhancement**: Consider updating the proxy to support the `/generate` endpoint for better compatibility
2. **Provider Updates**: Monitor ollama-ai-provider-v2 for stable releases
3. **streamText Configuration**: Consider using `maxSteps` parameter to control multi-step behavior
4. **Error Handling**: Implement better error messages for proxy-specific limitations
