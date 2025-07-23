# Agent System Investigation Report

## Current Status

After extensive debugging and logging implementation, we've identified the following:

### ✅ Working Components

1. **Agent Store Integration**
   - Successfully activating agent via `/agent` command
   - Proper extraction of MCP tools (26 tools from 4 connected servers)
   - Agent configuration with Ollama model support

2. **MCP Tool Wrapper**
   - Successfully extracting and wrapping MCP tools for OpenAI Agents SDK
   - Fixed Zod schema conversion issues (optional fields now use `.nullable()` instead of `.optional()`)
   - Error handling for problematic tool schemas

3. **Stream Handling**
   - Fixed async iterator bug in OpenAI Agents SDK's `StreamedRunResult`
   - Successfully accessing stream via `toStream()` method
   - Proper event handler implementation with multiple fallback strategies

4. **Model Provider Architecture**
   - Correct model provider factory implementation
   - Ollama provider properly initialized with correct base URL
   - Model capabilities detection working

### ❌ Current Blocker

**API Call Failure**: Getting `AI_APICallError: Not Found (404)` when the OpenAI Agents SDK tries to make API calls through the Vercel AI SDK to Ollama.

## Root Cause Analysis

The issue occurs at the intersection of three libraries:

1. **OpenAI Agents SDK** - Expects a specific API format
2. **Vercel AI SDK** - Acts as an adapter layer
3. **ollama-ai-provider** - Provides Ollama integration for Vercel AI SDK

The 404 error suggests that when the agent tries to execute, the API endpoint being called doesn't exist in Ollama's API structure.

## Investigation Plan for Ollama Integration

### Phase 1: Verify Ollama API Compatibility

1. **Check Ollama API Endpoints**

   ```typescript
   // Add debug logging to see actual API calls
   // In OllamaProvider constructor, intercept the client creation
   const ollama = createOllama({
     baseURL: url,
     // Add request interceptor if possible
   });
   ```

2. **Test Direct Ollama API Calls**
   - Create a test function that directly calls Ollama's chat endpoint
   - Compare with what the SDK is trying to call
   - Document the differences

3. **Analyze ollama-ai-provider Implementation**
   - Check if it properly translates Vercel AI SDK calls to Ollama format
   - Look for version compatibility issues
   - Check if streaming is properly implemented

### Phase 2: Debug API Call Flow

1. **Add Network Request Logging**

   ```typescript
   // Intercept fetch calls to see exact requests
   const originalFetch = window.fetch;
   window.fetch = async (...args) => {
     console.log('[FETCH Debug]', args);
     try {
       const response = await originalFetch(...args);
       if (!response.ok) {
         console.error('[FETCH Error]', response.status, response.statusText);
       }
       return response;
     } catch (error) {
       console.error('[FETCH Exception]', error);
       throw error;
     }
   };
   ```

2. **Trace the Call Stack**
   - Add breakpoints in the AI SDK model's `doStream` method
   - Check what endpoints are being constructed
   - Verify headers and request body format

### Phase 3: Implement Custom Ollama Provider

If the existing `ollama-ai-provider` isn't compatible, create a custom implementation:

```typescript
import { LanguageModelV1, LanguageModelV1StreamPart } from '@ai-sdk/provider';

export class CustomOllamaProvider implements LanguageModelV1 {
  async doGenerate(request: any): Promise<any> {
    // Direct implementation matching Ollama's API
  }

  async *doStream(request: any): AsyncGenerator<LanguageModelV1StreamPart> {
    // Implement streaming with proper Ollama API format
    const response = await fetch(`${this.baseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        prompt: this.formatPrompt(request),
        stream: true,
        // Map other parameters
      }),
    });

    // Parse streaming response
    const reader = response.body?.getReader();
    // ... implement streaming logic
  }
}
```

### Phase 4: Alternative Approaches

1. **Use OpenAI-Compatible Endpoints**
   - Check if Ollama has OpenAI-compatible endpoints
   - Some Ollama versions support `/v1/chat/completions`
   - This might work directly with OpenAI provider

2. **Bridge Layer Implementation**
   - Create a proxy server that translates OpenAI API calls to Ollama format
   - Run locally alongside Ollama
   - This ensures full compatibility

3. **Direct Ollama Integration**
   - Bypass Vercel AI SDK for Ollama
   - Implement a custom model provider that directly uses Ollama's API
   - Maintain compatibility with OpenAI Agents SDK's expectations

## Recommended Next Steps

1. **Immediate**: Add network request logging to see exact API calls
2. **Short-term**: Test if Ollama supports OpenAI-compatible endpoints
3. **Medium-term**: Implement custom Ollama provider if needed
4. **Long-term**: Consider contributing fixes back to ollama-ai-provider

## Code Locations for Investigation

- `/src/services/agent/model-provider.ts` - Model provider implementation
- `/src/services/agent/ai-sdk-agent.ts` - Agent implementation using Vercel AI SDK
- `node_modules/ollama-ai-provider` - Current Ollama integration
- `node_modules/@ai-sdk/provider` - Vercel AI SDK interfaces

## Testing Strategy

1. Create a minimal test case that reproduces the 404 error
2. Test with different Ollama models (some might have different API support)
3. Compare working OpenAI calls with failing Ollama calls
4. Document the exact differences in API structure

## Success Criteria

- Agent successfully executes with Ollama models
- Streaming responses work correctly
- Tool calling functions properly (for models that support it)
- No 404 errors during normal operation
