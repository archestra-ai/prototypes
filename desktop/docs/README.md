# Archestra AI Documentation

This directory contains architectural documentation and implementation guides for the Archestra AI platform.

## Core Documentation

### Architecture & Analysis

- **[Agent Implementation Analysis](./agent-implementation-analysis.md)** - Deep dive into the current agent architecture and patterns
- **[Communication Architecture](./communication-architecture.md)** - Overview of the HTTP gateway and communication patterns
- **[SSE Architecture Fit](./sse-architecture-fit.md)** - Analysis of SSE integration with the current architecture

### Implementation Guides

- **[AI SDK v5 Implementation Guide](./ai-sdk-v5-implementation-guide.md)** - Practical patterns and code examples for v5 implementation
- **[Autonomous Agent POC Decisions](./autonomous-agent-poc-decisions.md)** - Architectural decisions from the v5 POC implementation
- **[SSE Implementation Summary](./sse-implementation-summary.md)** - Complete SSE implementation with Vercel AI SDK v5 protocol
- **[SSE Tool Implementation](./sse-tool-implementation.md)** - Tool calling implementation over SSE
- **[Vercel AI SDK v5 Stream Protocol](./vercel-ai-sdk-v5-stream-protocol.md)** - Detailed v5 SSE protocol specification
- **[Chat Simplification Analysis](./chat-simplification-analysis.md)** - Analysis of the current chat implementation and recommendations for simplification
- **[Chat State Migration Plan](./chat-state-migration-plan.md)** - Historical: Partially completed migration to Vercel AI SDK v5 (4/6 phases)
- **[Chat State Sharing Issue](./chat-state-sharing-issue.md)** - Resolved issue with chat state not being shared between components
- **[Model Selection Implementation](./model-selection-implementation.md)** - How model selection is passed to the backend in v5

## Key Findings

### Current State

The codebase has been updated to use Vercel AI SDK v5 with proper SSE streaming:

- ✅ Implemented full v5 SSE protocol with data-only events
- ✅ Uses proper text-start/delta/end pattern for streaming
- ✅ Supports tool calling with input/output streaming
- ✅ Includes required `x-vercel-ai-ui-message-stream: v1` serverheader
- ✅ Proper [DONE] termination marker

### Implementation Highlights

The SSE implementation now fully supports Vercel AI SDK v5:

- **Endpoint**: `/api/chat` with full CORS support
- **Protocol**: Data-only SSE events with JSON payloads
- **Text Streaming**: Three-phase pattern with unique IDs
- **Tool Support**: Server-side MCP tool execution with streaming
- **Agent Mode**: Custom data parts for reasoning and progress
- **Error Handling**: Comprehensive error events and recovery

### Recommendations

1. **Immediate Actions**
   - Use the custom Ollama implementation (already implemented)
   - Document any new v4 patterns to prevent regression
   - Monitor AI SDK v5 releases for breaking changes

2. **Migration Strategy**
   - Follow patterns in the implementation guide
   - Use the State Bridge pattern for gradual migration
   - Test thoroughly with the pure testing patterns

3. **Best Practices**
   - Always implement proper error boundaries
   - Use type-safe message parts for custom data
   - Leverage v5's streaming callbacks for real-time updates

## Quick Links

### External Resources

- [Vercel AI SDK Documentation](https://sdk.vercel.ai)
- [Ollama Documentation](https://ollama.com)
- [MCP Protocol](https://modelcontextprotocol.io)

### Internal Resources

- Agent implementation: `/src/services/agent/`
- UI components: `/src/components/agent/`
- State management: `/src/stores/`
- Tests: `/src/services/agent/__tests__/`

## Contributing

When adding new documentation:

1. Place architectural decisions in this directory
2. Update this README with a brief description
3. Link related documents together
4. Include code examples where appropriate
5. Document both the "what" and the "why"
