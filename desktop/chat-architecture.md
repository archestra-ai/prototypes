# Archestra AI Chat Architecture

## Overview

This document describes the chat and agent system architecture in Archestra AI, including the request flow, component interactions, agent capabilities, and key design decisions.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Frontend (React)"
        UI[Chat UI Components]
        AUI[Agent UI Components]
        CP[ChatProvider]
        SDK[Vercel AI SDK v5]
        CS[Chat Store]
        AS[Agent Store]
        EH[Event Handlers]
    end

    subgraph "Backend (Rust/Tauri)"
        GW[HTTP Gateway :54587]
        STREAM[Ollama Proxy Handler]
        CRUD["/api/chat CRUD endpoints"]
        DB[(SQLite Database)]
        AE[Agent Executor]
        MCP[MCP Tool Executor]
        OC[Ollama Client]
        WS[WebSocket Service]
    end

    subgraph "External Services"
        OLLAMA[Ollama Server :54588]
        MCPS[MCP Servers]
    end

    UI --> CP
    AUI --> AS
    CP --> SDK
    SDK --> |"SSE Stream"| GW
    GW --> |"/llm/ollama/stream"| STREAM
    CS --> |"REST API"| CRUD
    AS --> |"Agent Context"| CP
    CP --> EH
    EH --> AS

    STREAM --> DB
    STREAM --> AE
    AE --> MCP
    AE --> OC
    STREAM --> WS

    OC --> OLLAMA
    MCP --> MCPS

    CRUD --> DB
    WS --> |"chat-title-updated"| CP
```

## Request Flow

### 1. Chat Message Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Chat UI
    participant AUI as Agent UI
    participant CP as ChatProvider
    participant AS as Agent Store
    participant BE as Backend API
    participant DB as Database
    participant AE as Agent Executor
    participant OL as Ollama
    participant MCP as MCP Tools

    User->>UI: Types message

    alt Agent Mode Active
        UI->>AS: Check agent state
        AS->>CP: Add agent context
    end

    UI->>CP: sendMessage()
    CP->>BE: POST /llm/ollama/stream

    BE->>DB: Create/Update chat session
    BE->>BE: Process message

    alt Agent Mode
        BE->>AE: Initialize agent
        AE->>AE: Plan tasks
        BE-->>CP: SSE: agent-state-update
        BE-->>CP: SSE: reasoning-entry

        loop Execute Tasks
            AE->>OL: Generate next action
            OL-->>AE: Tool selection

            alt Requires Approval
                BE-->>CP: SSE: tool-approval-request
                CP-->>AUI: Show approval UI
                User->>AUI: Approve/Reject
                AUI->>AS: Update approval
                AS->>BE: Send approval
            end

            AE->>MCP: Execute tool
            MCP-->>AE: Tool result
            BE-->>CP: SSE: task-progress
        end

        AE->>OL: Generate summary
        OL-->>AE: Final response
    else Standard Chat
        alt Has tools
            BE->>OL: Request with tools
            OL-->>BE: Tool call response
            BE->>MCP: Execute tool
            MCP-->>BE: Tool result
            BE->>OL: Send tool result
            OL-->>BE: Final response
        else No tools
            BE->>OL: Direct request
            OL-->>BE: Response stream
        end
    end

    BE-->>CP: SSE events stream
    CP-->>UI: Update messages
    UI-->>User: Display response

    Note over BE,DB: Auto-generates title after 4 messages
    Note over BE,DB: Persists agent metadata with messages
```

### 2. SSE Event Stream Protocol

The backend sends Server-Sent Events (SSE) following the Vercel AI SDK v5 protocol:

```mermaid
graph LR
    subgraph "Standard SSE Events (v5 SDK)"
        TS[0-text]
        TD[2-text-delta]
        SS[5-tool-call]
        FS[9-tool-result]
        TC[tool-call-streaming-start]
        TCS[6-tool-call-streaming-delta]
        MSG[3-assistant-message]
        CMSG[assistant-control-data]
        FIN[c-finish]
    end

    subgraph "Custom Data Events"
        DAS[data-agent-state]
        DRE[data-reasoning]
        DTP[data-task-progress]
        DTC[data-tool-call]
        DTAR[data-tool-approval-request]
        DWMU[data-working-memory]
        DERR[data-agent-error]
    end

    subgraph "Event Flow"
        TS --> TD
        TD --> MSG
        MSG --> SS
        SS --> TCS
        TCS --> FS
        
        DAS --> DRE
        DRE --> DTP
        DTP --> DTC
        DTC --> DTAR
        DTAR --> SS
        
        FS --> FIN
        DERR --> FIN
        CMSG --> FIN
    end
```

## Key Features

### 1. Chat Persistence

- All messages are automatically persisted to SQLite
- Chat sessions are created on first message
- Messages are linked via foreign key with CASCADE delete
- Agent metadata (plan IDs, step IDs, reasoning) persisted with messages

### 2. Streaming Architecture

- Uses Server-Sent Events (SSE) for real-time streaming
- Compatible with Vercel AI SDK v5 protocol
- Supports text streaming and tool execution events
- Extended with agent-specific events for state updates and reasoning
- Data parts for structured agent content (progress, memory, errors)

### 3. Tool Execution (MCP)

- Backend detects and executes MCP tools
- Multi-step tool chains with automatic reflection
- Tool results are streamed back to frontend
- Tools are executed server-side for security
- Agent mode adds:
  - Intelligent tool selection based on capabilities
  - Human-in-the-loop approval for sensitive operations
  - Tool performance tracking and retry strategies
  - Categorized tool security levels

### 4. LLM Integration

- Embedded Ollama instance on port 54588
- Supports multiple models
- Options passed through for response control (temperature, num_predict, etc.)

### 4. Autonomous Agent System

- **Planning Phase**: Breaks down complex tasks into steps
- **Execution Phase**: Executes tasks with tool selection
- **Working Memory**: Maintains context with relevance scoring
- **Reasoning System**: Tracks decisions with confidence scores
- **Error Recovery**: Automatic retry with alternative strategies

### 5. Agent Modes

- `idle`: Agent inactive, standard chat mode
- `initializing`: Agent starting up
- `planning`: Creating task breakdown
- `executing`: Running tasks
- `paused`: User-paused execution
- `completed`: All tasks finished

## Configuration

### URLs and Ports

```typescript
// Frontend configuration (src/consts.ts)
const ARCHESTRA_SERVER_BASE_URL = 'localhost:54587';
const ARCHESTRA_SERVER_BASE_HTTP_URL = `http://${ARCHESTRA_SERVER_BASE_URL}`;

export const ARCHESTRA_SERVER_API_URL = `${ARCHESTRA_SERVER_BASE_HTTP_URL}/api`;
export const ARCHESTRA_SERVER_OLLAMA_PROXY_URL = `${ARCHESTRA_SERVER_BASE_HTTP_URL}/llm/ollama`;
```

### Ollama Configuration

- Embedded instance runs on port 54588
- Not directly exposed to frontend
- All communication goes through backend proxy

## API Endpoints

### Chat Streaming

```
POST /llm/ollama/stream
Content-Type: application/json

{
  "session_id": "uuid-v4",
  "messages": [...],
  "model": "qwen2.5:3b",
  "tools": ["server_tool"],  // Format: "serverName_toolName"
  "stream": true,
  "options": {
    "temperature": 0.7,
    "num_predict": 2048
  },
  "agent_context": {  // Optional, added by ChatProvider when agent is active
    "mode": "executing",
    "tools": ["filesystem_read", "github_createIssue"],
    "instructions": "Help user with coding tasks",
    "plan_id": "plan_123",
    "step_id": "step_456"
  }
}

Response: Server-Sent Events stream (Vercel AI SDK v5 compatible)
```

**Important Notes**:
- The `session_id` is managed by ChatProvider and persists across messages
- Tools must be in `serverName_toolName` format for MCP integration
- Agent context is automatically injected via `window.__CHAT_METADATA__`
- The endpoint validates the chat request and creates chat if needed

### Chat CRUD Operations

```
GET    /api/chat          - List all chats
POST   /api/chat          - Create new chat
PATCH  /api/chat/{id}     - Update chat (e.g., title)
DELETE /api/chat/{id}     - Delete chat and messages
```

## Security Considerations

1. **Tool Execution**: All MCP tools are executed server-side in sandboxed environments
2. **Database Access**: Frontend never directly accesses the database
3. **LLM Access**: Ollama is not exposed to frontend, only through backend proxy
4. **CORS**: Properly configured for Tauri webview security
5. **Agent Security**:
   - Tool approval system for sensitive operations
   - Categorized security levels for tools
   - Sandboxed agent execution environment
   - Configurable auto-approval lists

## Development Notes

### Adding New Features

1. **New SSE Events**: 
   - Add event type to backend SSE emitter
   - Add handler in `event-handlers.ts` EVENT_HANDLERS map
   - Update agent store if event affects agent state
2. **New Tools**: 
   - Register in MCP server catalog
   - Backend automatically handles execution
   - Add to tool approval categories if sensitive
3. **New Models**: 
   - Pull model in Ollama
   - Model automatically appears in UI selector
4. **Agent Features**:
   - Add new agent modes in `agent-store.ts`
   - Extend `ReasoningEntry` types for new decision types
   - Add tool categories in approval system
   - Update `AgentContext` interface if needed

### Common Issues

1. **CORS Errors**: Ensure URLs include `http://` protocol
2. **Streaming Stops**: 
   - Check for unhandled errors in tool execution
   - Verify `window.__CHAT_STOP_STREAMING__` is not set
   - Check network connectivity to backend
3. **Missing Messages**: 
   - Verify database persistence in stream handler
   - Check chat session_id consistency
   - Ensure chat creation succeeds before streaming
4. **Agent Issues**:
   - Agent stuck: Check task timeout settings
   - Tool approval timeout: Verify SSE connection is active
   - Memory overflow: Adjust memory limits in backend config
   - State mismatch: Check event handler updates
5. **WebSocket Issues**:
   - Connection drops: Check reconnection logic
   - Missing events: Verify event subscription setup
   - Title not updating: Check WebSocket broadcast

## Future Enhancements

1. **WebSocket Support**: For bidirectional communication
2. **Message Editing**: Allow editing previous messages
3. **Export/Import**: Chat history export functionality
4. **Multi-modal**: Image and file support in conversations
5. **Agent Enhancements**:
   - Multi-agent collaboration
   - Long-term memory persistence
   - Custom agent personas
   - Visual task planning interface
   - Agent performance analytics
