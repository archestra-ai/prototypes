# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important Rules

- **NEVER modify shadcn/ui components**: Do not edit, update, or modify any files in `desktop/src/components/ui/`. These are third-party components that should remain untouched. Components in this folder should only be installed using `pnpm dlx shadcn@latest add <component-name>`. If UI changes are needed, create custom components or extend them in other directories.
- **Always use pnpm**: This project uses pnpm v10.13.1 as the package manager. Never use npm or yarn.
- **API Changes**: After modifying any API endpoints in Rust, you MUST regenerate the OpenAPI schema and TypeScript client by running `cargo run --bin codegen`.

## Common Development Commands

### Environment Variables

```bash
# No special environment variables are required for basic development
# The application uses embedded Ollama on port 54588
# HTTP gateway runs on port 54587
```

### Building and Running

```bash
# Install dependencies (uses pnpm)
pnpm install

# Run the full application in development mode
pnpm tauri dev

# Build the desktop application
pnpm tauri build

# Run only the frontend (Vite dev server on port 1420)
pnpm dev

# Preview production build
pnpm preview
```

### Testing

```bash
# Frontend tests (Vitest in watch mode)
pnpm test

# Run a single test file
pnpm test path/to/test.tsx

# Run frontend tests once (CI mode)  
pnpm test run

# Run tests with coverage
pnpm test:coverage

# Rust tests (run from desktop/src-tauri)
cd desktop/src-tauri && cargo test

# Run a single Rust test
cd desktop/src-tauri && cargo test test_name

# Run Rust tests with output
cd desktop/src-tauri && cargo test -- --nocapture
```

### Code Quality

```bash
# Format TypeScript/React code with Prettier
pnpm prettier

# Check TypeScript/React formatting
pnpm prettier --check .

# TypeScript type checking
pnpm typecheck

# Format Rust code
cd desktop/src-tauri && cargo fmt

# Check Rust formatting
cd desktop/src-tauri && cargo fmt --check

# Run Rust linter
cd desktop/src-tauri && cargo clippy --all-targets --all-features -- -D warnings
```

### OpenAPI Schema Management

```bash
# Generate OpenAPI schema from Rust code + generate TypeScript client from OpenAPI schema
cd desktop/src-tauri && cargo run --bin codegen
# This command MUST be run after modifying API endpoints
```

### Database Inspection

```bash
# Launch sqlite-web to inspect the database in browser
pnpm dbstudio

# The script will:
# - Automatically find the database location (~/Library/Application Support/com.archestra-ai.app/archestra.db on macOS)
# - Install sqlite-web via uv if not available (falls back to pip)
# - Open the database at http://localhost:8080
# - Allow browsing tables, running queries, and viewing schema
```

### OAuth Proxy Service

```bash
cd backend/oauth-proxy
npm install
npm run dev  # Development mode with nodemon
npm start    # Production mode
```

## High-Level Architecture

This is a **Tauri desktop application** that integrates AI/LLM capabilities with MCP (Model Context Protocol) support for a privacy-focused AI assistant with autonomous agent capabilities and extensible tool support. The application uses a fully streaming architecture with Server-Sent Events (SSE) for real-time chat and agent responses.

### Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS v4 + shadcn/ui components
- **State Management**: Zustand v5
- **Routing**: Tanstack React Router
- **Backend**: Rust with Tauri v2 framework, Axum web framework, SeaORM for SQLite database
- **API Layer**: HTTP gateway on port 54587 with OpenAPI schema generation using utoipa
- **AI Integration**: Ollama for local LLM support, MCP (Model Context Protocol) for tool integration, Vercel AI SDK v5 for streaming chat and agent responses
- **Streaming**: Server-Sent Events (SSE) for real-time chat streaming via `/llm/ollama/stream` endpoint
- **Testing**: Vitest + React Testing Library (frontend), Rust built-in test framework with rstest (backend)

### Key Directories

#### Frontend (`desktop/src/`)

- `components/`: Reusable UI components
  - `ui/`: Base UI components (shadcn/ui style) - DO NOT MODIFY
    - `popover.tsx`: Added for UI interactions (installed via shadcn)
  - `kibo/`: AI-specific components (messages, code blocks, reasoning)
    - `code-block.tsx`: Rich code display with syntax highlighting, file tabs, copy functionality, and theme support
    - `tool-part.tsx`: Tool execution display with collapsible results
  - `agent/`: Autonomous agent components
    - `AgentControlPanel.tsx`: Complete agent control interface with activation, pause/resume, and stop functionality
    - `AgentModeIndicator.tsx`: Real-time visual indicators for agent state and progress
    - `ReasoningPanel.tsx`: Configurable reasoning display with verbose/concise/hidden modes
    - `TaskProgress.tsx`: Task execution progress tracking and visualization
  - `chat/`: Chat-specific components
    - `ChatMessage.tsx`: Message rendering with agent metadata support
    - `MessageContent.tsx`: Message content display with agent enhancements
  - `DeleteChatConfirmation.tsx`: Dialog for chat deletion confirmation
  - `TypewriterText.tsx`: Animated text display component
- `pages/`: Main application pages
  - `ChatPage/`: AI chat interface with streaming responses
    - `ChatHistory/`: Message display with auto-scroll behavior
      - `Messages/`: Individual message components
        - `ToolExecutionResult/`: Displays tool call results with timing, status, and collapsible sections
  - `ConnectorCatalogPage/`: MCP server catalog and management
  - `LLMProvidersPage/`: LLM model management
  - `SettingsPage/`: Application settings
- `stores/`: Zustand stores for state management
  - `chat-store.ts`: Chat state management with streaming integration via Vercel AI SDK
  - `agent-store.ts`: Agent state management with task planning and execution tracking (backend-driven)
- `hooks/`: Custom React hooks including MCP client hooks
  - `use-typewriter.ts`: Hook for typewriter text animation
  - `use-sse-chat.ts`: SSE chat streaming integration with Vercel AI SDK v5
- `lib/`: Utility functions and helpers
  - `api/`: Generated TypeScript client from OpenAPI schema (DO NOT EDIT)
  - `api-client.ts`: Configured HTTP client instance
  - `websocket.ts`: WebSocket client service for real-time event handling
  - `utils/`:
    - `ollama.ts`: Contains `convertMCPServerToolsToOllamaTools` for MCP tool integration
    - `agent.ts`: Agent utility functions and helpers
- `providers/`: React context providers
  - `chat-provider/`: Centralized chat state provider with SSE streaming support
- `types/`: TypeScript type definitions
  - `agent.ts`: Comprehensive agent types for task planning and execution
  - `agent-ui.ts`: UI-specific agent type definitions
  - `index.ts`: Type exports and re-exports

#### Backend (`desktop/src-tauri/`)

- `src/database/`: Database layer with SeaORM entities and migrations
- `src/models/`: Business logic and data models
  - `chat/`: Chat management with CRUD operations and automatic title generation
  - `chat_interactions/`: Message persistence and chat history management
  - `mcp_server/`: MCP server models and definitions
  - `external_mcp_client/`: External MCP client configurations
  - `mcp_request_log/`: Request logging and analytics
- `src/gateway/`: HTTP gateway exposing the following APIs:
  - `/api`: REST API for Archestra resources (OpenAPI documented)
    - `/api/chat`: Chat CRUD operations (create, read, update, delete chats)
    - `oauth/`: OAuth authentication flows for MCP servers (e.g., Gmail)
  - `/mcp`: Archestra MCP server endpoints
  - `/proxy/:mcp_server`: Proxies requests to MCP servers running in Archestra sandbox
  - `/llm/:provider`: Proxies requests to LLM providers
    - `/llm/ollama/*`: Proxies all requests to embedded Ollama instance
    - `/llm/ollama/stream`: Main SSE streaming endpoint with chat persistence, agent support, and tool execution
  - `/ws`: WebSocket endpoint for real-time event broadcasting
- `src/ollama/`: Ollama integration module
  - `client.rs`: HTTP client for Ollama API
  - `server.rs`: Ollama server management
  - `consts.rs`: Ollama-related constants
- `src/gateway/websocket.rs`: WebSocket service for real-time event broadcasting
- `src/openapi.rs`: OpenAPI schema configuration using utoipa
- `binaries/`: Embedded Ollama binaries for different platforms
- `sandbox-exec-profiles/`: macOS sandbox profiles for security

### Core Features

1. **Autonomous Agent System**: Complete agent implementation with task planning and execution
   - **Agent Modes**: Multiple execution modes (idle, planning, executing, paused, completed)
   - **Task Planning**: Structured task breakdown with dependencies and progress tracking
   - **Working Memory**: Context management with relevance scoring and TTL
   - **Reasoning System**: Structured reasoning with confidence scoring and alternatives
2. **MCP Integration**: Supports MCP servers for extending AI capabilities with tools via rmcp library
   - **Available MCP Servers**: Context7, Filesystem, GitHub, Brave Search, PostgreSQL, Slack, Gmail, Fetch (HTTP requests), and Everything (file search)
   - **Tool Approval System**: Human-in-the-loop approval for sensitive operations
   - **Tool Selection**: Intelligent tool selection based on capabilities and constraints
3. **Local LLM Support**: Runs Ollama locally for privacy-focused AI interactions
4. **Chat Persistence**: Full CRUD operations for chat conversations with SQLite database storage
5. **Intelligent Chat Titles**: Automatic LLM-generated chat titles based on conversation content
6. **OAuth Authentication**: Handles OAuth flows for services like Gmail
7. **Enhanced Chat Interface**: Full-featured chat UI with streaming responses and agent integration
   - **SSE Streaming**: Real-time streaming with Vercel AI SDK v5
   - **Agent Controls**: Activation, pause/resume, and stop functionality
   - **Tool Execution Display**: Shows execution time, status indicators, and collapsible argument/result sections
   - **Enhanced Code Blocks**: Syntax highlighting with Shiki, file tabs, copy functionality, and theme support
   - **Reasoning Display**: Configurable verbosity for agent reasoning
8. **Security**: Uses macOS sandbox profiles for MCP server execution
9. **API Documentation**: Auto-generated OpenAPI schema with TypeScript client
10. **Real-time Events**: WebSocket-based event broadcasting for UI updates and agent state changes

### Database Schema

The application uses SQLite with SeaORM for database management. Key tables include:

#### Chat Management Tables

- **chats**: Stores chat sessions with metadata

  - `id` (Primary Key): Auto-incrementing integer
  - `session_id` (Unique): UUID-v4 generated automatically via SQLite expression
  - `title` (Optional): Chat title (auto-generated after 4 messages or user-defined)
  - `llm_provider`: LLM provider used (e.g., "ollama")
  - `created_at`: Timestamp with timezone

- **chat_interactions**: Stores individual messages within chats
  - `id` (Primary Key): Auto-incrementing integer
  - `chat_id` (Foreign Key): References chats.id with CASCADE delete
  - `content` (JSON): Message data with role and content
  - `created_at`: Timestamp with timezone
  - Index on `chat_id` for query performance

The relationship ensures that deleting a chat automatically removes all associated messages via CASCADE delete.

#### MCP Server Management Tables

- **mcp_servers**: Stores MCP server configurations

  - `id` (Primary Key): Auto-incrementing integer
  - `name` (Unique): Server identifier name
  - `server_config` (JSON): Server configuration stored as `serde_json::Value`
    - Contains: `command`, `args`, `env`, and `transport` fields
    - Serialized/deserialized automatically via SeaORM
  - `created_at`: Timestamp with timezone

The `MCPServerDefinition` struct used throughout the codebase:
```rust
pub struct MCPServerDefinition {
    pub name: String,
    pub server_config: ServerConfig,
}
```

**JSON Handling Pattern**:
- Database storage: Fields are stored as `serde_json::Value` with proper error handling
- API layer: OpenAPI schema correctly represents `server_config` as `ServerConfig` type
- Serialization: Handled automatically by SeaORM with descriptive error messages

### WebSocket Architecture

The application uses WebSockets for real-time event broadcasting between the backend and frontend, replacing Tauri-specific event system with a more flexible, standard protocol.

#### Backend WebSocket Service (`src/gateway/websocket.rs`)

- **Service Architecture**: Centralized `WebSocketService` manages connections and message broadcasting
- **Connection Management**: Maintains active connections in thread-safe `Arc<Mutex<Vec<SplitSink>>>`
- **Message Types**: Extensible enum-based system with `WebSocketMessage`:

  ```rust
  pub enum WebSocketMessage {
      ChatTitleUpdated(ChatTitleUpdatedWebSocketPayload { chat_id: i32, title: String }),
      // Future event types can be added here
  }
  ```

- **Broadcasting**: Async broadcast method sends messages to all connected clients with automatic cleanup
- **JSON Protocol**: Messages are serialized as `{type: string, payload: object}`

#### Frontend WebSocket Client (`src/lib/websocket.ts`)

- **Auto-Reconnection**: Uses `reconnecting-websocket` library with exponential backoff (1s-10s)
- **Type-Safe Handlers**: Strongly typed message handlers with TypeScript
- **Event Subscription**: Publisher-subscriber pattern for component event handling:

  ```typescript
  websocketService.subscribe("chat-title-updated", (message) => {
    // Handle the event
  });
  ```

- **Singleton Pattern**: Single WebSocket connection shared across the application

#### Current WebSocket Events

- **`chat-title-updated`**: Broadcasts when AI generates or updates a chat title
  - Payload: `{chat_id: number, title: string}`
  - Triggered after 4 chat interactions
  - Frontend automatically updates UI without refresh

### Key Patterns

#### SSE Streaming with Vercel AI SDK v5

The application uses a custom transport configuration to integrate with the backend SSE endpoint:

```typescript
// Custom transport configuration in ChatProvider
const chatTransport = new DefaultChatTransport({
  api: `${ARCHESTRA_SERVER_BASE_HTTP_URL}/llm/ollama/stream`,
  prepareSendMessagesRequest: ({ messages }) => {
    const metadata = window.__CHAT_METADATA__ || {};
    return {
      body: {
        session_id: currentChatSessionId,
        messages,
        model: metadata.model || selectedModel,
        agent_context: metadata.agent_context,
        tools: metadata.tools,
        options: metadata.options
      }
    }
  }
});
```

**Key Integration Points**:
- Global `window.__CHAT_METADATA__` object for metadata injection (required by v5 SDK architecture)
- `window.__CHAT_STOP_STREAMING__` for coordinated streaming control
- Custom data event handlers for agent-specific SSE events
- Automatic chat persistence during streaming

#### API Endpoint Pattern (Rust)

```rust
#[utoipa::path(
    get,
    path = "/api/resource",
    tag = "resource",
    responses(
        (status = 200, description = "Success", body = Vec<Resource>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_resources(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<Resource>>, StatusCode> {
    // Implementation
}
```

#### Frontend API Calls

```typescript
import { apiClient } from "@/lib/api-client";

// Always use the generated API client
const response = await apiClient.getResources();
if (response.data) {
  // Handle success
}
```

#### Zustand Store Pattern

```typescript
interface StoreState {
  items: Item[];
  isLoading: boolean;
  fetchItems: () => Promise<void>;
}

export const useItemStore = create<StoreState>((set) => ({
  items: [],
  isLoading: false,
  fetchItems: async () => {
    set({ isLoading: true });
    try {
      const response = await apiClient.getItems();
      set({ items: response.data || [] });
    } finally {
      set({ isLoading: false });
    }
  },
}));
```

#### Chat API Endpoints

The application provides two types of chat endpoints:

**1. SSE Streaming Endpoint (for chat interactions):**
```typescript
// Stream chat responses with optional agent support
POST /llm/ollama/stream
Content-Type: application/json

Body: {
  messages: Message[],
  model?: string,
  tools?: string[],
  stream?: boolean,  // Defaults to true
  options?: {
    temperature?: number,
    num_predict?: number
  }
  // Agent context is added automatically by ChatProvider when agent is active
}

Response: Server-Sent Events stream (Vercel AI SDK v5 compatible)
```

**Note**: The frontend uses a custom transport configuration in ChatProvider to properly format requests for the backend. The `/llm/ollama/stream` endpoint is specifically for LLM interactions, while `/api/chat` endpoints are purely for database CRUD operations.

**2. CRUD Endpoints (for chat management):**
```typescript
// List all chats (ordered by created_at DESC)
GET /api/chat
Response: ChatWithInteractions[]

// Create new chat with specified LLM provider
POST /api/chat
Body: { llm_provider: string }
Response: ChatWithInteractions

// Update chat title
PATCH /api/chat/{id}
Body: { title: string }
Response: ChatWithInteractions

// Delete chat and all messages (CASCADE deletes all interactions)
DELETE /api/chat/{id}
Response: 204 No Content
```

**Chat Persistence Workflow**:

1. Frontend uses `/llm/ollama/stream` endpoint via Vercel AI SDK v5's `useChat` hook with custom transport
2. Chat is automatically created on first message if session doesn't exist
3. Messages are persisted during streaming via the Ollama proxy interceptor
4. Backend maintains chat session through automatic title generation after 4 messages
5. Frontend can manage chats via REST endpoints: GET, POST, PATCH, DELETE at `/api/chat`
6. Agent metadata (plan IDs, step IDs, reasoning) is persisted with messages when agent mode is active

**Backend SSE Event Processing**:
- Standard Vercel AI SDK v5 events: `text-delta`, `tool-call`, `tool-result`, etc.
- Custom data events prefixed with `data-` for agent-specific updates
- Event handlers in frontend automatically update agent store and UI
- All events flow through the same SSE stream for unified processing

**Agent-Enhanced Streaming**:

- SSE events support agent-specific data parts: reasoning entries, task progress, state updates
- Backend accepts `agent_context` with tools, instructions, and mode configuration
- Real-time streaming of agent planning, execution, and completion states
- Tool approval requests streamed to frontend for user interaction

**Chat Title Generation**:

- Triggers automatically after exactly 4 interactions (2 user + 2 assistant messages)
- Uses the same LLM model as the chat to generate a concise 5-6 word title
- Runs asynchronously in background using `tokio::spawn` with 30-second timeout
- Broadcasts `chat-title-updated` WebSocket message with `{chat_id, title}` payload
- Frontend updates UI in real-time via event listener without page refresh

**Frontend State Management**:

- **Chat State**: Zustand store (`chat-store.ts`) for streaming chat management
  - Handles streaming messages with Vercel AI SDK v5 integration
  - Supports request cancellation via `AbortController`
  - Event listeners automatically sync backend changes to UI
- **Agent State**: Dedicated agent store (`agent-store.ts`) for agent lifecycle
  - Tracks agent mode, current plan, task progress, and execution state
  - Manages working memory and reasoning history
  - Handles tool approval workflows and error recovery
  - All agent execution happens server-side; frontend is display-only
- **Centralized Provider**: `ChatProvider` context for shared streaming state
  - Integrates chat and agent stores for unified experience
  - Manages SSE event handling and state synchronization
- All API calls use generated TypeScript client for type safety

### Important Configuration

- **Package Manager**: pnpm v10.13.1 (NEVER use npm or yarn)
- **Node Version**: 24.4.1
- **Gateway Port**: 54587 (configured in `desktop/src/consts.ts`)
- **WebSocket Endpoint**: `ws://localhost:54587/ws` (configured in `desktop/src/consts.ts`)
- **TypeScript Path Alias**: `@/` maps to `./src/`
- **Prettier Config**: 120 character line width, single quotes, sorted imports
- **Pre-commit Hooks**: Prettier formatting via Husky
- **OpenAPI Generation**: Clean output directory, Prettier formatting

### Key Dependencies

- **Frontend**:
  - `ai`: Vercel AI SDK v5 (5.0.0-canary.30) for SSE streaming chat integration
  - `@ai-sdk/react`: React bindings for Vercel AI SDK v5 (5.0.0-canary.30)
  - `@radix-ui/react-popover`: For popover UI component (required by shadcn/ui)
  - `@radix-ui/react-progress`: For progress indicators in agent task execution
  - `reconnecting-websocket`: For WebSocket client with automatic reconnection support
- **Backend**:
  - `tokio`: Enhanced with async runtime features for spawning background tasks
  - `futures`: For stream processing in SSE responses
  - Additional async utilities for agent execution management

### CI/CD Workflow

The GitHub Actions CI/CD pipeline consists of several workflows with concurrency controls to optimize resource usage:

#### Main Testing Workflow (`.github/workflows/linting-and-tests.yml`)

- PR title linting with conventional commits
- **Automatic Rust formatting and fixes**: CI automatically applies `cargo fix` and `cargo fmt` changes and commits them back to the PR
- Rust tests on Ubuntu, macOS (ARM64 & x86_64), and Windows
  - **Improved job naming**: CI jobs now display human-friendly names (e.g., "Rust Linting and Tests (Ubuntu)") instead of technical platform identifiers (e.g., "Rust Linting and Tests (ubuntu-latest)")
- Frontend formatting and tests
- Frontend build verification
- **Automatic OpenAPI schema updates**: CI automatically regenerates and commits OpenAPI schema and TypeScript client if they're outdated
- Zizmor security analysis for GitHub Actions

#### Pull Request Workflow (`.github/workflows/on-pull-requests.yml`)

- Runs the main testing workflow on all PRs
- **Automated Claude Code Reviews**: Uses Claude Opus 4 model to provide automated PR reviews with feedback on code quality, security, and best practices
- **Automated CLAUDE.md Updates**: Uses Claude Sonnet 4 model to automatically:
  - Update the CLAUDE.md file to reflect changes made in PRs
  - Add PR descriptions when they are missing
  - Ensure documentation stays current with codebase changes
- Both Claude jobs skip release-please PRs; the review job also skips WIP PRs
- Concurrency control cancels in-progress runs when new commits are pushed
- Consolidates functionality from the removed `claude-code-review.yml` workflow

#### Release Please Workflow (`.github/workflows/release-please.yml`)

- Manages automated releases using Google's release-please action
- Creates and maintains release PRs with changelogs
- **Triggers**: Runs on pushes to `main` branch
- **Authentication**: Uses GitHub App authentication:
  - Generates a GitHub App installation token using `actions/create-github-app-token@v2`
  - Token is created from `ARCHESTRA_RELEASER_GITHUB_APP_ID` and `ARCHESTRA_RELEASER_GITHUB_APP_PRIVATE_KEY` secrets
  - Generated token is used for both fetching existing releases and creating new ones via tauri-action
- **Version Management**: Release-please automatically manages version updates through `extra-files` configuration:
  - **Configuration**: Located in `.github/release-please/release-please-config.json`
  - **Extra Files**: Automatically updates version numbers in:
    - `desktop/package.json` (JSON format, path: `$.version`)
    - `desktop/src-tauri/Cargo.toml` (TOML format, path: `$.package.version`)
    - `desktop/src-tauri/tauri.conf.json` (JSON format, path: `$.version`)
  - **Process**: Version updates happen when release-please creates the release PR, not during the build
  - **Format**: Versions are extracted from release-please tags (format: `app-vX.Y.Z`)
- **Multi-platform desktop builds**: When a desktop release is created:
  - Builds Tauri desktop applications for Linux (ubuntu-latest) and Windows (windows-latest)
  - Uses matrix strategy with `fail-fast: false` to ensure all platforms build
  - Creates draft GitHub releases with platform-specific binaries using the generated GitHub App token
  - Tags releases with format `app-v__VERSION__`

#### Interactive Claude Workflow (`.github/workflows/claude.yml`)

- Triggers on `@claude` mentions in issues, PR comments, and reviews
- Provides comprehensive development environment with Rust and frontend tooling
- Supports extensive bash commands including testing, building, formatting, code generation, and package management
- Uses Claude Opus 4 model for complex development tasks
- Concurrency control prevents multiple Claude runs on the same issue/PR
- Pre-configured with allowed tools for pnpm, cargo, and project-specific commands
- **Custom Instructions**: Provides structured PR context to Claude including:
  - Repository name and PR number
  - Changed files list
  - PR title and description
  - All PR comments
  - This additional context enhances Claude's understanding of the PR being discussed

### Development Notes

- Single instance enforcement prevents multiple app instances
- The app supports deep linking with `archestra-ai://` protocol
- MCP servers are sandboxed for security on macOS
- OAuth proxy runs as a separate service on a configured port
- OpenAPI schema must be regenerated after API changes (CI will catch if forgotten)
- Frontend API calls should use the generated client, not Tauri commands
- Database migrations should be created for schema changes using SeaORM
- Use rstest fixtures from `test_fixtures` for Rust database tests
- Mock external dependencies appropriately in tests
- CI automatically formats Rust code and regenerates OpenAPI schemas, committing changes back to PRs
- CI uses GitHub Actions bot credentials for automated commits

### Agent System Architecture

The agent system provides autonomous task planning and execution capabilities with all logic running server-side:

#### Agent Lifecycle

1. **Initialization**: Agent activates with specific mode and configuration
2. **Planning**: Breaks down user requests into structured task plans (backend)
3. **Execution**: Executes tasks with tool selection and error handling (backend)
4. **Monitoring**: Real-time progress tracking via SSE events
5. **Completion**: Graceful completion with summary and metrics

#### Agent Components

- **Agent Store**: Frontend state management for display and user interaction
- **Backend Agent Executor**: Server-side agent logic in Rust
- **SSE Event Stream**: Real-time updates for agent state, reasoning, and progress
- **Tool Approval System**: Human-in-the-loop approval via SSE events
- **Memory Manager**: Working memory with relevance scoring (backend)

#### SSE Event Types for Agent

The backend sends these additional SSE events during agent execution:

```typescript
// Agent-specific SSE events (sent as data events)
type AgentDataEvent =
  | { type: 'data-agent-state', data: { mode: AgentMode, objective?: string } }
  | { type: 'data-reasoning', data: ReasoningEntry }
  | { type: 'data-task-progress', data: TaskProgress }
  | { type: 'data-tool-call', data: { tool: string, args: any } }
  | { type: 'data-tool-approval-request', data: ToolApprovalRequest }
  | { type: 'data-working-memory-update', data: MemoryEntry }
  | { type: 'data-agent-error', data: { error: string } }
```

**Event Processing Flow**:
```typescript
// Frontend event handler pattern
if (data.type.startsWith('data-')) {
  const dataType = data.type.substring(5); // Remove 'data-' prefix
  const handler = EVENT_HANDLERS[dataType];
  if (handler) handler(data.data);
}
```

#### Agent Configuration

Agent configuration is managed through the chat request's metadata:

```typescript
// Agent context passed with chat messages
interface AgentContext {
  mode: AgentMode;
  tools: string[];
  instructions: string;
  planId?: string;
  stepId?: string;
}
```

### Testing Patterns

#### Chat Feature Testing

- **Rust Tests**: Use `rstest` fixtures for database setup in chat API tests
- **API Tests**: Test all CRUD operations with proper error cases (404, 500)
- **Integration Tests**: Verify cascade deletes and foreign key constraints
- **Frontend Tests**: Mock API responses for chat operations
- **Streaming Tests**: Test message accumulation and persistence during streaming
- **Event Tests**: Verify WebSocket messages are broadcast correctly for UI updates

#### Agent System Testing

- **Agent Store Tests**: Comprehensive state management and lifecycle testing
- **Task Planning Tests**: Verify task breakdown and dependency management
- **Tool Approval Tests**: Test human-in-the-loop approval workflows
- **Memory Management Tests**: Test working memory with TTL and relevance
- **Error Recovery Tests**: Verify agent error handling and recovery strategies
- **Integration Tests**: End-to-end agent execution with mock tools

#### SSE Event Testing

- **Event Handler Tests**: Verify all custom data events are processed correctly
- **Auto-scroll Tests**: Test scroll behavior during streaming and message updates
- **Message Processing Tests**: Complex message parsing with tool results and thinking content
- **Chat Provider Tests**: Provider setup and event subscription management

#### Test Coverage Gaps

**Well-Tested Areas**:
- Agent store lifecycle and state management
- Message processing and rendering
- Tool approval workflows
- SSE event handlers

**Areas Needing More Coverage**:
- Backend SSE streaming endpoint integration tests
- WebSocket event broadcasting tests
- End-to-end agent execution with real tool calls
- Chat title generation and broadcasting
- Error recovery during streaming interruptions
