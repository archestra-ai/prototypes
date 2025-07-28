# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Activate Serena MCP to navigate and edit the code.

## Common Development Commands

### Building and Running

```bash
# Install dependencies (uses pnpm)
pnpm install

# Run the full application in development mode
pnpm tauri dev

# Build the desktop application
pnpm tauri build

# Run only the frontend (Vite dev server)
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

# Rust tests
cd src-tauri && cargo test

# Run a single Rust test
cd src-tauri && cargo test test_name
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
cd src-tauri && cargo fmt

# Check Rust formatting
cd src-tauri && cargo fmt --check

# Run Rust linter
cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings
```

### OpenAPI Schema Management

```bash
# Generate OpenAPI schema from Rust code
cd src-tauri && cargo run --bin dump_openapi

# Generate TypeScript client from OpenAPI schema
pnpm codegen

# Both commands should be run after modifying API endpoints
```

## High-Level Architecture

This is a **Tauri desktop application** that integrates AI/LLM capabilities with MCP (Model Context Protocol) support.

### Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui components
- **State Management**: Zustand + Vercel AI SDK v5's useChat hook
- **Backend**: Rust with Tauri framework, SeaORM for SQLite database
- **API Layer**: HTTP gateway on port 54587 with OpenAPI schema generation
- **AI Integration**: Ollama for local LLM support, MCP for tool integration
- **Testing**: Vitest + React Testing Library (frontend), Rust built-in test framework (backend)

### Key Directories

#### Frontend (`/src`)

- `components/`: Reusable UI components
  - `ui/`: Base UI components (shadcn/ui style)
  - `kibo/`: AI-specific components (messages, code blocks, reasoning)
- `pages/`: Main application pages
  - `ChatPage/`: AI chat interface with SSE streaming
  - `ConnectorCatalogPage/`: MCP server catalog
  - `LLMProvidersPage/`: LLM model management
  - `SettingsPage/`: Application settings
- `stores/`: Zustand stores for state management
- `hooks/`: Custom React hooks including MCP client hooks
- `lib/`: Utility functions and helpers
  - `api/`: Generated TypeScript client from OpenAPI schema
  - `api-client.ts`: Configured HTTP client instance
- `providers/`: React context providers
  - `chat-provider.tsx`: Vercel AI SDK v5 integration

#### Backend (`/src-tauri`)

- `src/database/`: Database layer with SeaORM entities and migrations
- `src/models/`: Business logic and data models
  - `chat/`: Chat management with CRUD operations
  - `chat_interactions/`: Message persistence
  - `mcp_server/`: MCP server models including OAuth support
- `src/gateway/`: HTTP gateway exposing the following APIs:
  - `/api/chat`: CRUD operations for chat management
  - `/api/chat/stream`: SSE streaming endpoint for Vercel AI SDK v5
  - `/mcp`: Archestra MCP server endpoints
  - `/proxy/:mcp_server`: Proxies to MCP servers
  - `/llm/ollama/*`: Proxies to embedded Ollama instance
- `src/ollama/`: Ollama integration
  - `client.rs`: HTTP client for Ollama API
  - `server.rs`: Embedded Ollama server management
  - `consts.rs`: Port configuration (54588)

### Core Features

1. **Chat Persistence**: SQLite database with automatic title generation
2. **SSE Streaming**: Real-time chat responses using Vercel AI SDK v5 protocol
3. **MCP Integration**: Extensible tool support via MCP servers
4. **Local LLM**: Embedded Ollama instance for privacy-focused AI
5. **OpenAPI Documentation**: Auto-generated TypeScript client from Rust endpoints

### Important Configuration

- **Package Manager**: pnpm v10.13.1
- **Node Version**: 24.4.1
- **Gateway Port**: 54587
- **Ollama Port**: 54588 (embedded instance)
- **TypeScript Path Alias**: `@/` maps to `./src/`

### SSE (Server-Sent Events) Architecture

The application uses SSE for real-time streaming communication:

- **Streaming Endpoint**: `/api/chat/stream` handles SSE streaming with inherent agent capabilities
- **CRUD Endpoints**: `/api/chat` provides REST operations for chat management (GET, POST, PATCH, DELETE)
- **Frontend Integration**: Uses Vercel AI SDK v5's `useChat` hook with `DefaultChatTransport`
- **Protocol**: Full Vercel AI SDK v5 protocol with data-only SSE events
- **Tool Execution**: MCP tools executed server-side with automatic result reflection
- **Multi-Step Support**: Supports tool chaining with up to 10 rounds of execution
- **Message Format**: JSON payloads with type field, proper [DONE] termination
- **Model Selection**: Uses `prepareSendMessagesRequest` with global metadata pattern (see `docs/model-selection-implementation.md`)

### Inherently Agentic Chat

The chat system is now inherently agentic - no special commands needed:

- **Automatic Tool Use**: When tools are selected, the LLM can use them automatically
- **Multi-Step Workflows**: The LLM can chain multiple tool calls to complete complex tasks
- **Result Reflection**: After each tool execution, the LLM analyzes the results before proceeding
- **Natural Interaction**: Just type your request - no `/agent` command required

## Development Guidelines

When working on this codebase:

### Code Style

- Follow existing patterns and conventions
- Use TypeScript strictly (no `any` types)
- Prefer functional components and hooks in React
- Use Rust's type system effectively

### State Management

- Use Zustand for complex application state
- Use Vercel AI SDK's `useChat` for chat messages
- Keep server state synchronized via API calls

### Error Handling

- Always handle errors gracefully
- Log errors to console in development
- Show user-friendly error messages in UI

### Testing

- Write tests for critical business logic
- Use rstest fixtures for Rust database tests
- Mock external dependencies appropriately

### Common Issues & Solutions

1. **Gateway not starting**: Check if port 54587 is free
2. **Ollama not responding**: Embedded instance runs on port 54588
3. **Type errors after API changes**: Run `pnpm codegen` to regenerate client
4. **Database migrations failing**: Check migration order and dependencies

## Contributing

1. Always run `cargo fmt` and `pnpm prettier` before committing
2. Ensure tests pass: `cargo test` and `pnpm test`
3. Update OpenAPI schema after API changes
4. Keep CLAUDE.md updated with significant architectural changes
