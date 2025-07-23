# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
# Run tests (Vitest in watch mode)
pnpm test
```

### Code Formatting

```bash
# Format code with Prettier
pnpm prettier
```

### OAuth Proxy Service

```bash
cd backend/oauth-proxy
npm install
npm run dev  # Development mode with nodemon
npm start    # Production mode
```

## High-Level Architecture

This is a **Tauri desktop application** that integrates AI/LLM capabilities with MCP (Model Context Protocol) support.

### Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui components
- **State Management**: Zustand
- **Backend**: Rust with Tauri framework, SeaORM for SQLite database
- **Services**: Node.js OAuth proxy for handling OAuth flows
- **AI Integration**: Ollama for local LLM support, MCP for tool integration
- **Testing**: Vitest + React Testing Library

### Key Directories

#### Frontend (`/src`)

- `components/`: Reusable UI components
  - `ui/`: Base UI components (shadcn/ui style)
  - `kibo/`: AI-specific components (messages, code blocks, reasoning)
- `pages/`: Main application pages
  - `ChatPage/`: AI chat interface
  - `ConnectorCatalogPage/`: MCP server catalog
  - `LLMProvidersPage/`: LLM model management
  - `SettingsPage/`: Application settings
- `stores/`: Zustand stores for state management
- `hooks/`: Custom React hooks including MCP client hooks
- `lib/`: Utility functions and helpers

#### Backend (`/src-tauri`)

- `src/database/`: Database layer with SeaORM entities and migrations
- `src/models/`: Business logic and data models
  - `mcp_server/`: MCP server models including OAuth support
  - `external_mcp_client/`: External MCP client configurations
- `src/gateway/`: Gateway which exposes the following high-level API:
  - `/mcp`: Archestra MCP server
  - `/proxy/:mcp_server`: Proxies requests to MCP servers running in Archestra sandbox
  - `/llm/:provider`: Proxies requests to LLM providers
  - `/api`: Responsible for CRUDing Archestra resources
- `src/ollama.rs`: Ollama integration
- `binaries/`: Embedded Ollama binary for macOS
- `sandbox-exec-profiles/`: macOS sandbox profiles for security

### Core Features

1. **MCP Integration**: Supports MCP servers for extending AI capabilities with tools
2. **Local LLM Support**: Runs Ollama locally for privacy-focused AI interactions
3. **OAuth Authentication**: Handles OAuth flows for services like Gmail
4. **Chat Interface**: Full-featured chat UI with streaming responses and tool execution
5. **Security**: Uses macOS sandbox profiles for MCP server execution

### Key Patterns

- **State Management**: Uses Zustand stores in `/src/stores/`
- **API Communication**: Tauri commands for frontend-backend communication
- **Database**: SQLite with SeaORM for persistence
- **Error Handling**: Comprehensive error types in Rust backend
- **Type Safety**: Full TypeScript on frontend, strong typing in Rust
- **Testing**: Component tests with Vitest and React Testing Library

### Development Notes

- The app uses `pnpm` as the package manager (v10.13.1)
- OAuth proxy runs as a separate service on a configured port
- MCP servers can be sandboxed for security on macOS
- The app supports deep linking with `archestra-ai://` protocol
- Single instance enforcement prevents multiple app instances
- TypeScript path alias: `@/` maps to `./src/`
- Pre-commit hooks run Prettier formatting via Husky
