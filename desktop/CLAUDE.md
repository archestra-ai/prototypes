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
- **API Layer**: HTTP gateway on port 54587 with OpenAPI schema generation
- **Services**: Node.js OAuth proxy for handling OAuth flows
- **AI Integration**: Ollama for local LLM support, MCP for tool integration
- **Testing**: Vitest + React Testing Library (frontend), Rust built-in test framework (backend)

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
  - `api/`: Generated TypeScript client from OpenAPI schema
  - `api-client.ts`: Configured HTTP client instance

#### Backend (`/src-tauri`)

- `src/database/`: Database layer with SeaORM entities and migrations
- `src/models/`: Business logic and data models
  - `mcp_server/`: MCP server models including OAuth support
  - `external_mcp_client/`: External MCP client configurations
  - `mcp_request_log/`: Request logging and analytics
- `src/gateway/`: HTTP gateway exposing the following APIs:
  - `/mcp`: Archestra MCP server endpoints
  - `/proxy/:mcp_server`: Proxies requests to MCP servers running in Archestra sandbox
  - `/llm/:provider`: Proxies requests to LLM providers
  - `/api`: REST API for Archestra resources (OpenAPI documented)
- `src/ollama.rs`: Ollama integration
- `src/openapi.rs`: OpenAPI schema configuration using utoipa
- `binaries/`: Embedded Ollama binary for macOS
- `sandbox-exec-profiles/`: macOS sandbox profiles for security

### Core Features

1. **MCP Integration**: Supports MCP servers for extending AI capabilities with tools
2. **Local LLM Support**: Runs Ollama locally for privacy-focused AI interactions
3. **OAuth Authentication**: Handles OAuth flows for services like Gmail
4. **Chat Interface**: Full-featured chat UI with streaming responses and tool execution
5. **Security**: Uses macOS sandbox profiles for MCP server execution
6. **API Documentation**: Auto-generated OpenAPI schema with TypeScript client

### Key Patterns

- **State Management**: Uses Zustand stores in `/src/stores/`
- **API Communication**: HTTP API client generated from OpenAPI schema (replaced Tauri commands)
- **Database**: SQLite with SeaORM for persistence
- **Error Handling**: Comprehensive error types in Rust backend
- **Type Safety**: Full TypeScript on frontend with generated types, strong typing in Rust
- **Testing**: Component tests with Vitest and React Testing Library, Rust tests using rstest fixtures

### Important Configuration

- **Package Manager**: pnpm v10.13.1
- **Node Version**: 24.4.1
- **Gateway Port**: 54587 (configured in `src/consts.ts`)
- **TypeScript Path Alias**: `@/` maps to `./src/`
- **Prettier Config**: 120 character line width, single quotes, sorted imports
- **Pre-commit Hooks**: Prettier formatting via Husky
- **OpenAPI Generation**: Clean output directory, Prettier formatting

### CI/CD Workflow

The GitHub Actions workflow (`.github/workflows/linting-and-tests.yml`) includes:

- Rust formatting and linting checks
- Rust tests on Ubuntu, macOS (ARM64 & x86_64), and Windows
- Frontend formatting and tests
- Frontend build verification
- OpenAPI schema freshness check (ensures schema and TypeScript client are up-to-date)

### Development Notes

- Single instance enforcement prevents multiple app instances
- The app supports deep linking with `archestra-ai://` protocol
- MCP servers can be sandboxed for security on macOS
- OAuth proxy runs as a separate service on a configured port
- OpenAPI schema must be regenerated after API changes (CI will catch if forgotten)
