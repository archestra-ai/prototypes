# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Note**: The main Electron desktop application code is located in the `desktop_app/` directory. Always run commands from the `desktop_app/` directory unless specified otherwise.

## Important Rules

- **NEVER modify shadcn/ui components**: Do not edit, update, or modify any files in `src/components/ui/`. These are third-party components that should remain untouched. Components in this folder should only be installed using `pnpm dlx shadcn@latest add <component-name>`. If UI changes are needed, create custom components or extend them in other directories.
- **Always use pnpm**: This project uses pnpm v10.14.0 as the package manager. Never use npm or yarn.
- **Working directory**: Always ensure you're in the `desktop_app/` directory when running commands.

## Common Development Commands

### Building and Running

```bash
# Install dependencies (uses pnpm)
pnpm install

# Run the application in development mode with pretty logs
pnpm start

# Package the Electron application
pnpm package

# Create distributable files
pnpm make
```

### Testing

```bash
# Run tests (Vitest with main config)
pnpm test

# Run a single test file
pnpm test path/to/test.ts

# Run tests once (CI mode)
pnpm test run
```

### Code Quality

```bash
# Format all files with Prettier
pnpm exec prettier --write .

# Check formatting without making changes
pnpm exec prettier --check .

# TypeScript type checking
pnpm typecheck
```

### Database Management

```bash
# Launch Drizzle Studio to inspect the database in browser
pnpm db:studio

# Generate migrations after schema changes
pnpm db:generate

# Apply migrations to the database
pnpm db:migrate

# Push schema changes directly (development only, skips migrations)
pnpm db:push

# Note: Database location: ~/Library/Application Support/com.archestra.ai/archestra.db on macOS
```

### Code Generation

```bash
# Generate all API clients (Archestra API, catalog, and libpod)
pnpm codegen:all

# Generate individual API clients
pnpm codegen:archestra:api      # Generate Archestra API client from OpenAPI spec
pnpm codegen:archestra:catalog  # Generate catalog API client
pnpm codegen:libpod            # Generate Podman/libpod client for container management
```

### Publishing and Releasing

```bash
# Publish the application (builds and uploads to GitHub release)
pnpm publish

# Publish with dry run (test without uploading)
pnpm publish --dry-run
```

## High-Level Architecture

This is an **Electron desktop application** that integrates AI/LLM capabilities with MCP (Model Context Protocol) support for a privacy-focused AI assistant with extensible tool support.

### Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS v4 + shadcn/ui components
- **State Management**: Zustand v5
- **Routing**: Tanstack React Router
- **Backend**: Node.js with Fastify web framework, Drizzle ORM for SQLite database
- **Desktop Framework**: Electron v37 with Electron Forge for building and packaging
- **API Layer**: HTTP server on port 54587 with WebSocket support
- **Services**: Node.js OAuth proxy for handling OAuth flows
- **AI Integration**: Ollama for local LLM support, MCP (Model Context Protocol) for tool integration
- **Testing**: Vitest + React Testing Library

### Key Directories

#### Frontend (`src/ui/`)

- `components/`: Reusable UI components
  - `ui/`: Base UI components (shadcn/ui style) - DO NOT MODIFY
    - `popover.tsx`: Added for UI interactions (installed via shadcn)
  - `kibo/`: AI-specific components (messages, code blocks, reasoning)
    - `code-block.tsx`: Rich code display with syntax highlighting, file tabs, copy functionality, and theme support
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
  - `chat-store.ts`: Chat state management with persistence integration
- `hooks/`: Custom React hooks including MCP client hooks
  - `use-typewriter.ts`: Hook for typewriter text animation
- `lib/`: Utility functions and helpers
  - `api/`: Generated TypeScript client from API schema
  - `api-client.ts`: Configured HTTP client instance
  - `websocket.ts`: WebSocket client service for real-time event handling
  - `utils/`:
    - `ollama.ts`: Contains `convertMCPServerToolsToOllamaTools` for MCP tool integration

#### Backend (`src/backend/`)

- `db/`: Database layer with Drizzle ORM
  - `schema/`: Database schema definitions
  - `migrations/`: SQL migration files
- `services/`: Business logic and services
  - `chat-service.ts`: Chat management with CRUD operations
  - `llm-service.ts`: LLM provider integration
  - `mcp-service.ts`: MCP server management
  - `ollama-service.ts`: Ollama integration and management
- `routes/`: API endpoints exposing:
  - `/api`: REST API for Archestra resources
    - `/api/chat`: Chat CRUD operations (create, read, update, delete chats)
    - `/api/mcp`: MCP server management
  - `/llm/:provider`: Proxies requests to LLM providers
  - `/ws`: WebSocket endpoint for real-time event broadcasting
- `processes/`: Process management
  - `server-process.ts`: Runs the backend server in a separate Node.js process
  - `ollama-process.ts`: Manages Ollama binary execution

#### Electron Main Process (`src/`)

- `main.ts`: Main Electron process entry point
- `preload.ts`: Preload script for secure context bridging
- `ipc/`: Inter-process communication handlers
- `utils/`: Electron-specific utilities

### Core Features

1. **MCP Integration**: Supports MCP servers for extending AI capabilities with tools
   - **Available MCP Servers**: Context7, Filesystem, GitHub, Brave Search, PostgreSQL, Slack, Gmail, Fetch (HTTP requests), and Everything (file search)
2. **Local LLM Support**: Runs Ollama locally for privacy-focused AI interactions
3. **Chat Persistence**: Full CRUD operations for chat conversations with SQLite database storage
4. **Intelligent Chat Titles**: Automatic LLM-generated chat titles based on conversation content
5. **OAuth Authentication**: Handles OAuth flows for services like Gmail
6. **Chat Interface**: Full-featured chat UI with streaming responses and tool execution
   - **Tool Execution Display**: Shows execution time, status indicators, and collapsible argument/result sections
   - **Enhanced Code Blocks**: Syntax highlighting with Shiki, file tabs, copy functionality, and theme support
7. **API Documentation**: Well-structured REST API with TypeScript client generation
8. **Real-time Events**: WebSocket-based event broadcasting for UI updates
9. **Sandbox Security**: Container-based isolation for MCP servers using Podman

### Database Schema

The application uses SQLite with Drizzle ORM for database management. Key tables include:

#### Chat Management Tables

- **chats**: Stores chat sessions with metadata

  - `id` (Primary Key): Auto-incrementing integer
  - `session_id` (Unique): UUID-v4 identifier
  - `title` (Optional): Chat title (auto-generated after 4 messages or user-defined)
  - `llm_provider`: LLM provider used (e.g., "ollama")
  - `created_at`: Timestamp

- **chat_interactions**: Stores individual messages within chats
  - `id` (Primary Key): Auto-incrementing integer
  - `chat_id` (Foreign Key): References chats.id with CASCADE delete
  - `content` (JSON): Message data with role and content
  - `created_at`: Timestamp
  - Index on `chat_id` for query performance

The relationship ensures that deleting a chat automatically removes all associated messages via CASCADE delete.

#### MCP Server Management Tables

- **mcp_servers**: Stores MCP server configurations
  - `id` (Primary Key): Auto-incrementing integer
  - `name` (Unique): Server identifier name
  - `server_config` (JSON): Server configuration
    - Contains: `command`, `args`, `env`, and `transport` fields
  - `created_at`: Timestamp

### WebSocket Architecture

The application uses WebSockets for real-time event broadcasting between the backend and frontend.

#### Backend WebSocket Service

- **Service Architecture**: Fastify WebSocket plugin manages connections
- **Connection Management**: Maintains active WebSocket connections
- **Message Protocol**: JSON-based messages with type and payload structure

#### Frontend WebSocket Client (`src/ui/lib/websocket.ts`)

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
- **Sandbox Events**: Real-time progress updates for container initialization
  - `sandbox-startup-started/completed/failed`
  - `sandbox-podman-runtime-progress`
  - `sandbox-base-image-fetch-started/completed/failed`
  - `sandbox-mcp-server-starting/started/failed`

### Sandbox Architecture

The application implements container-based sandboxing for MCP servers using Podman for enhanced security:

#### Backend Sandbox Implementation (`src/backend/sandbox/`)

- **PodmanRuntime**: Manages Podman machine lifecycle
  - Automatic machine creation and startup
  - Dynamic socket path resolution (avoids Docker/Orbstack conflicts)
  - Multi-platform binary distribution (Linux, macOS, Windows)
- **McpServerSandboxManager**: Orchestrates sandbox initialization
  - Base image management (`europe-west1-docker.pkg.dev/friendly-path-465518-r6/archestra-public/mcp-server-base:0.0.1`)
  - Container lifecycle management per MCP server
  - WebSocket progress broadcasting
- **Security Features**:
  - Non-root container execution (uid: 1000, gid: 1000)
  - Process isolation per MCP server
  - stdin/stdout communication only (no exposed ports)
  - Minimal base image with only essential dependencies

#### Sandbox API and UI

- **API Endpoint**: `GET /api/sandbox/status` - Returns initialization status
- **UI Components**:
  - `SandboxStartupProgress`: Real-time initialization progress display
  - `sandbox-store.ts`: Zustand store for sandbox state management
- **Bundled Binaries**: Located in `resources/bin/` directory, organized by platform:
  - `linux/arm64/`, `linux/x86_64/`: Linux binaries
  - `mac/arm64/`, `mac/x86_64/`: macOS binaries  
  - `windows/arm64/`, `windows/x86_64/`: Windows binaries
  - Each platform includes: `podman-remote-static-v5.5.2`, `gvproxy`, and `ollama`

### Key Patterns

#### Frontend API Calls

```typescript
import { apiClient } from "@/lib/api-client";

// Always use the generated API client
const response = await apiClient.getChats();
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

The application provides RESTful endpoints for chat management:

```typescript
// List all chats (ordered by created_at DESC)
GET /api/chat
Response: Chat[]

// Create new chat with specified LLM provider
POST /api/chat
Body: { llm_provider: string }
Response: Chat

// Update chat title
PATCH /api/chat/{id}
Body: { title: string }
Response: Chat

// Delete chat and all messages (CASCADE deletes all interactions)
DELETE /api/chat/{id}
Response: 204 No Content
```

**Chat Persistence Workflow**:

1. Frontend sends chat request with `session_id` to `/llm/ollama/api/chat`
2. Backend checks if chat exists by `session_id`, creates new chat if not found
3. User message is persisted to `chat_interactions` table before sending to LLM
4. Response streams to frontend while being accumulated in background
5. Complete assistant response is persisted after streaming completes
6. Messages are stored as JSON: `{"role": "user|assistant", "content": "text"}`

**Chat Title Generation**:

- Triggers automatically after exactly 4 interactions (2 user + 2 assistant messages)
- Uses the same LLM model as the chat to generate a concise 5-6 word title
- Runs asynchronously in background with 30-second timeout
- Broadcasts `chat-title-updated` WebSocket message with `{chat_id, title}` payload
- Frontend updates UI in real-time via event listener without page refresh

**Frontend State Management**:

- Uses Zustand store (`chat-store.ts`) for centralized chat state
- Handles streaming messages with `streamingMessageId` tracking
- Supports request cancellation via `AbortController`
- Event listeners automatically sync backend changes to UI
- All API calls use generated TypeScript client for type safety

### Important Configuration

- **Package Manager**: pnpm v10.14.0 (NEVER use npm or yarn)
- **Node Version**: 22.16.0 (matches Electron 37's bundled Node.js version)
- **Electron Version**: 37.x
- **Backend Port**: 54587 (configured in `src/consts.ts`)
- **WebSocket Endpoint**: `ws://localhost:54587/ws` (configured in `src/consts.ts`)
- **TypeScript Path Aliases**:
  - `@backend/*` maps to `./src/backend/*`
  - `@clients/*` maps to `./src/clients/*`
  - `@archestra/types` maps to `./src/types`
  - `@ui/*` maps to `./src/ui/*`
- **Prettier Config**: 120 character line width, single quotes, sorted imports
- **Pre-commit Hooks**: Prettier formatting via Husky
- **Electron Configuration**: Managed via Electron Forge in `forge.config.ts`
  - Platform-specific binary bundling: Only includes binaries for target platform/architecture
  - macOS code signing: Configured for Developer ID certificates and notarization
  - Windows/Linux: Currently creates ZIP files (Squirrel installer disabled pending code signing)

### Build Configuration

The application uses multiple Vite configurations for different Electron processes:

- **Main Process**: `vite.main.config.ts` - Builds the main Electron process
- **Preload Script**: `vite.preload.config.ts` - Builds the preload script
- **Renderer Process**: `vite.renderer.config.mts` - Builds the frontend React app
- **Server Process**: `vite.server.config.ts` - Builds the backend server

### Key Dependencies

- **Frontend**:
  - `@radix-ui/react-popover`: For popover UI component (required by shadcn/ui)
  - `reconnecting-websocket`: For WebSocket client with automatic reconnection support
  - `electron`: Desktop application framework
  - `@electron-forge/*`: Build and packaging tools
- **Backend**:
  - `fastify`: High-performance web framework
  - `@fastify/websocket`: WebSocket support
  - `drizzle-orm`: Type-safe ORM for SQLite
  - `better-sqlite3`: SQLite database driver

### CI/CD Workflow

The GitHub Actions CI/CD pipeline consists of several workflows with concurrency controls to optimize resource usage:

#### Main Testing Workflow (`.github/workflows/linting-and-tests.yml`)

- PR title linting with conventional commits
- Frontend formatting and tests
- Frontend build verification
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

#### Release Please Workflow (`.github/workflows/release-please.yml`)

- Manages automated releases using Google's release-please action
- Creates and maintains release PRs with changelogs
- **Triggers**: Runs on pushes to `main` branch
- **Authentication**: Uses GitHub App authentication
- **Version Management**: Release-please automatically manages version updates:
  - **Configuration**: Located in `.github/release-please/release-please-config.json`
  - **Versioning Strategy**: Currently using alpha pre-releases (`0.0.1-alpha.x`)
  - **Extra Files**: Automatically updates version numbers in `package.json`
  - **Process**: Version updates happen when release-please creates the release PR
  - **Tag Format**: `v{version}` (e.g., `v0.0.1-alpha.0`)
- **Multi-platform desktop builds**: When a desktop release is created:
  - Builds Electron applications for all platforms:
    - Linux: x64, ARM64
    - macOS: x64, ARM64 (with code signing and notarization)
    - Windows: x64, ARM64
  - Uses reusable workflow (`.github/workflows/build-desktop-application.yml`)
  - Uploads binaries to GitHub release created by release-please
  - Supports dry-run mode for testing builds without publishing

#### Interactive Claude Workflow (`.github/workflows/claude.yml`)

- Triggers on `@claude` mentions in issues, PR comments, and reviews
- Provides comprehensive development environment with frontend tooling
- Supports extensive bash commands including testing, building, formatting, and package management
- Uses Claude Opus 4 model for complex development tasks
- Concurrency control prevents multiple Claude runs on the same issue/PR
- Pre-configured with allowed tools for pnpm and project-specific commands

### Development Notes

- Single instance enforcement prevents multiple app instances
- The app supports deep linking with `archestra-ai://` protocol
- Frontend API calls should use the generated client for type safety
- Database migrations should be created for schema changes using Drizzle
- Mock external dependencies appropriately in tests
- CI uses GitHub Actions bot credentials for automated commits
- Pre-commit hooks run Prettier automatically via Husky and lint-staged

### Testing Patterns

#### Chat Feature Testing

- **Frontend Tests**: Mock API responses for chat operations
- **API Tests**: Test all CRUD operations with proper error cases (404, 500)
- **Integration Tests**: Verify cascade deletes and foreign key constraints
- **Streaming Tests**: Test message accumulation and persistence during streaming
- **Event Tests**: Verify WebSocket messages are broadcast correctly for UI updates
