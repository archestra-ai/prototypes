# Autonomous Agent POC - Architectural Decisions

This document captures the key architectural and implementation decisions made during the Autonomous Agent Experience POC for Archestra AI.

## Overview

The POC aimed to implement a proper AI SDK v5 architecture for the autonomous agent experience, replacing the hybrid v4/v5 implementation with a fully v5-native solution.

**Historical Context**: The original v4 implementation used custom code due to legitimate constraints - no official Ollama provider, experimental MCP tools, and need for provider-specific features. See [AI SDK Evolution: From v4 to v5](./ai-sdk-evolution-v4-to-v5.md) for the full historical context.

## Key Decisions

### 1. Removal of OpenAI Provider Support

**Decision**: Completely remove OpenAI provider code and consolidate on Ollama for local model support.

**Rationale**:

- Aligns with Archestra's focus on local, privacy-preserving AI
- Simplifies the codebase by removing unused provider code
- Reduces dependencies and potential security concerns

**Implementation**:

- Removed `OpenAIProvider` class from `model-provider.ts`
- Removed `isOpenAIModel()` detection logic
- Removed `@ai-sdk/openai` dependency
- Consolidated on `OllamaProvider` as the sole model provider

### 2. Custom Ollama Implementation for v5 Compatibility

**Decision**: Use a custom Ollama implementation instead of the `ollama-ai-provider` package.

**Rationale**:

- The `ollama-ai-provider` package is not yet compatible with AI SDK v5
- The package uses deprecated methods (`.embedding()` instead of `.textEmbeddingModel()`)
- Our custom implementation properly implements the `LanguageModelV2` interface

**Implementation**:

```typescript
// Instead of using ollama-ai-provider
const ollama = createOllama({ baseURL });
const model = ollama(modelName);

// We use our custom implementation
return this.createCustomOllamaModel(modelName);
```

**Benefits**:

- Full AI SDK v5 compatibility
- Direct control over streaming format and error handling
- Proper implementation of v5 stream parts
- Better integration with our proxy architecture

### 3. Removal of AgentEventHandler

**Decision**: Remove the custom `AgentEventHandler` class and rely on v5's built-in streaming capabilities.

**Rationale**:

- The custom event handler was a v4 pattern that added unnecessary complexity
- AI SDK v5 provides native SSE streaming support
- Reduces code maintenance and potential bugs

**Implementation**:

- Deleted `agent-event-handler.ts`
- Removed manual streaming intervals from `agent-store.ts`
- Updated imports and exports throughout the codebase
- Simplified agent execution flow

### 4. V5 Message Architecture

**Decision**: Implement proper UIMessage/ModelMessage separation as per v5 architecture.

**Rationale**:

- Optimizes token usage by excluding UI metadata from model messages
- Provides better type safety with v5's message part system
- Enables proper streaming of different content types (text, tool calls, reasoning)

**Implementation**:

- Created `AgentUIMessage` interface extending v5's `UIMessage`
- Implemented custom message parts for reasoning and task progress
- Added `state-bridge.ts` for message conversion and synchronization

### 5. SSE Streaming Protocol

**Decision**: Use v5's `toUIMessageStreamResponse()` for Server-Sent Events streaming.

**Rationale**:

- Provides DevTools visibility for debugging
- Standard protocol for real-time updates
- Better error recovery and reconnection handling

**Implementation**:

- Created SSE endpoint handler in task 12
- Integrated with useChat hook for automatic streaming updates
- Added comprehensive SSE streaming tests

### 6. State Management Hybrid Approach

**Decision**: Maintain Zustand for complex agent state while using useChat for message state.

**Rationale**:

- Zustand excels at managing complex application state (agent lifecycle, preferences, tool approval)
- useChat provides automatic message synchronization and streaming
- Best of both worlds approach

**Implementation**:

- Created `StateBridge` to synchronize between useChat and Zustand
- Maintained existing Zustand stores for backward compatibility
- Enhanced with v5 React hooks integration

### 7. Tool Wrapper Enhancement

**Decision**: Create v5-specific tool wrapper with proper type inference and streaming callbacks.

**Rationale**:

- v5 tools support `outputSchema` for type-safe results
- Streaming callbacks (`onInputStart`, `onInputDelta`) provide real-time feedback
- Better integration with MCP protocol

**Implementation**:

- Created `mcp-tool-wrapper-v5.ts`
- Added schema generation from MCP tool descriptions
- Implemented streaming callbacks for progress updates

### 8. Preserved UI Components

**Decision**: Keep all existing UI components and enhance them with v5 features.

**Rationale**:

- Existing components are well-designed and user-tested
- Backward compatibility reduces migration risk
- Progressive enhancement approach

**Implementation**:

- Enhanced `ChatHistory` with useChat integration
- Updated `ReasoningPanel` for data streaming
- Connected `TaskProgress` to v5's onStepFinish callbacks
- Maintained all existing UI/UX features

## Testing Strategy

### Unit Tests

- Created pure unit tests to avoid import issues (`*-pure.test.ts` pattern)
- Focused on testing logic without complex dependencies
- Achieved high test coverage for critical functionality

### Integration Tests

- SSE streaming tests for connection, parsing, and error recovery
- Message conversion tests for UIMessage/ChatMessage round trips
- Agent lifecycle tests for activation, pause, resume, and stop

### Test Patterns

- Used mock implementations to isolate functionality
- Avoided complex store dependencies in tests
- Focused on behavior rather than implementation details

## Performance Optimizations

1. **Removed Manual Streaming Intervals**: Eliminated `setInterval` polling in favor of v5's push-based streaming
2. **Message Caching**: Leveraged v5's built-in message caching
3. **Stream Buffering**: Used v5's intelligent buffering for smooth UI updates
4. **Proper Cleanup**: Ensured all streams and controllers are properly cleaned up

## Security Considerations

1. **Local-Only Models**: Removed all cloud provider code paths
2. **Tool Approval**: Maintained human-in-the-loop controls with v5 structure
3. **Message Sanitization**: Validated all message parts before display
4. **Schema Enforcement**: Strict validation for tool inputs/outputs

## Migration Path

For teams upgrading from v4 to v5:

1. **Start with State Bridge**: Implement synchronization between existing state and v5
2. **Migrate Components Gradually**: Use feature flags to toggle between implementations
3. **Test Streaming First**: Ensure SSE streaming works before removing old code
4. **Keep Fallbacks**: Maintain compatibility layers during transition

## Future Considerations

1. **Official Ollama Provider**: When available, evaluate switching from custom implementation
2. **Enhanced Streaming**: Explore v5's experimental features as they stabilize
3. **Performance Monitoring**: Add telemetry to track v5 performance improvements
4. **Type Generation**: Consider generating types from OpenAPI for better type safety

## Conclusion

The POC successfully demonstrated that a full v5 implementation is not only possible but provides significant benefits:

- Cleaner, more maintainable code
- Better streaming performance
- Enhanced type safety
- Improved developer experience
- Future-proof architecture

The decisions made prioritize long-term maintainability while preserving the sophisticated features that make Archestra AI unique in the market.
