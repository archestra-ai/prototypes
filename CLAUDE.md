# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Directory

**ALWAYS run all commands from the `desktop_app/` directory unless specifically instructed otherwise.**

## Important Rules

1. **NEVER modify files in `src/ui/components/ui/`** - These are shadcn/ui components and should remain unchanged
2. **ALWAYS use pnpm** (not npm or yarn) for package management
3. **Run database commands from `desktop_app/`** directory
4. **Use Podman** (not Docker) for container operations

## Common Development Commands

### Running the Application

```bash
cd desktop_app
pnpm start              # Start development app
pnpm start:server       # Start backend server only
```

### Building & Packaging

```bash
cd desktop_app
pnpm package           # Package app for current platform
pnpm make             # Create platform installer
pnpm build:universal  # Build universal macOS binary
```

### Testing & Code Quality

```bash
cd desktop_app
pnpm test             # Run all tests
pnpm test:ui          # Run UI tests only
pnpm test:backend     # Run backend tests only
pnpm typecheck        # Check TypeScript types
pnpm prettier         # Format code
```

### Database Management

```bash
cd desktop_app
pnpm db:studio        # Open Drizzle Studio GUI
pnpm db:migrate       # Run database migrations
pnpm db:push          # Push schema changes (dev only)
```

### API Documentation

```bash
cd desktop_app
pnpm generate:openapi-clients  # Generate TypeScript clients from OpenAPI specs
```

## High-Level Architecture

### Overview

Archestra is an enterprise-grade Model Context Protocol (MCP) platform built as a privacy-focused Electron desktop application. It provides a secure runtime environment for AI agents with local-first architecture.

### Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **Desktop**: Electron 37.2.5 with Electron Forge
- **Backend**: Fastify server running in separate process
- **Database**: SQLite with Drizzle ORM (snake_case naming)
- **State Management**: Zustand stores
- **Build**: Vite with separate configs for each process
- **Containerization**: Podman for sandboxing

### Process Architecture

1. **Main Process** (`src/main.ts`): Electron main process handling windows and IPC
2. **Renderer Process** (`src/renderer.tsx`): React UI application
3. **Server Process** (`src/server-process.ts`): Fastify backend server (port 2024)
4. **Preload Script** (`src/preload.ts`): Secure bridge between renderer and main

### Key Features

- **PodmanRuntime**: Manages Podman machine lifecycle
  - Automatic machine creation and startup
  - Dynamic socket path resolution (avoids Docker/Orbstock conflicts)
  - Multi-platform binary distribution (Linux, macOS, Windows)
  - Enhanced progress tracking with percentage-based reporting
  - Combined progress calculation (50% machine startup + 50% image pull)
  - Progress parsing utilities for real-time output processing
- **McpServerSandboxManager**: Orchestrates sandbox initialization
  - Base image management (`europe-west1-docker.pkg.dev/friendly-path-465518-r6/archestra-public/mcp-server-base:0.0.1`)
  - Container lifecycle management per MCP server
  - WebSocket progress broadcasting with detailed status updates
  - Comprehensive `statusSummary` getter combining runtime and container statuses
- **Progress Tracking Architecture**:
  - Hierarchical progress system: Runtime → Image → Container levels
  - Real-time progress parsing from Podman machine installation output
  - Detailed percentage mapping for each stage (0-5% lookup, 5-60% download, etc.)
  - Type-safe status schemas using Zod validation
- **Container Management**: Enhanced container lifecycle tracking
  - Multiple container states: `not_created`, `created`, `initializing`, `running`, `error`
  - Percentage-based progress tracking (0-100%) through container lifecycle
  - Human-readable status messages for each stage of container startup
  - Detailed error reporting for different failure scenarios
  - MCP socket connection pooling and management
- **Image Management**: Streaming progress during base image operations
  - Real-time progress tracking during image pull with percentage completion
  - Stage-specific messages (resolving, copying blobs, writing manifest)
  - Proper error capture and reporting during image operations
  - Progressive percentage calculation based on blob count
- **UI Progress Components**:
  - Real-time progress bars in MCP server settings
  - Status badges (Connecting/Connected/Error) with color coding
  - Loading states with spinner animations
  - Error display with detailed messages
- **Logging and Debugging**:
  - **Container Logs**: Persistent MCP server log files stored in `~/Library/Application Support/archestra/logs/<container-name>.log`
    - Real-time streaming from container stdout/stderr to log files
    - Multiplexed stream processing handles Podman's 8-byte header format
    - Session markers with timestamps for each container start
    - Append mode preserves historical logs across container restarts
    - UI dialog for viewing container logs (accessible via FileText icon in MCP server settings)
    - Terminal-style log viewer with black background and green monospace text
    - Manual refresh functionality with loading states
    - API endpoint: `GET /mcp_proxy/:id/logs?lines=100` for retrieving recent logs
    - `getRecentLogs()` method in PodmanContainer for programmatic access
  - **Request Logging**: Comprehensive MCP request/response tracking in database
    - Unique UUID for each request with timing metrics
    - Captures method, headers, body, status codes, duration, and errors
    - Client information tracking (user agent, platform, version)
    - Session correlation with MCP session IDs
    - Advanced filtering by server, method, status, date range
    - Analytics dashboard with statistics (total requests, success rate, avg duration)
    - Automatic cleanup of logs older than 7 days (configurable)
    - API endpoints:
      - `GET /api/mcp_request_log` - Paginated log retrieval with filtering
      - `GET /api/mcp_request_log/:id` - Individual log entry access
      - `GET /api/mcp_request_log/stats` - Analytics and statistics
      - `DELETE /api/mcp_request_log` - Log cleanup endpoint
  - **Centralized Path Management**: Shared paths utility (`src/backend/utils/paths.ts`)
    - `USER_DATA_DIRECTORY`: Application data storage (from `ARCHESTRA_USER_DATA_PATH`)
    - `LOGS_DIRECTORY`: Log file storage (from `ARCHESTRA_LOGS_PATH`)
    - `DATABASE_PATH`: SQLite database location
    - `PODMAN_REGISTRY_AUTH_FILE_PATH`: Podman authentication file
    - Environment variables set by main process for backend access
    - Fallback to `/tmp` for codegen scenarios when env vars not set
- **Security Features**:
  - Non-root container execution (uid: 1000, gid: 1000)
  - Process isolation per MCP server
  - stdin/stdout communication only (no exposed ports)
  - Minimal base image with only essential dependencies
- **Organization Management**:
  - Centralized organization settings and preferences
  - Onboarding flow tracking and completion status
  - Telemetry opt-in functionality with user privacy controls
  - API endpoints: `/api/onboarding/status` and `/api/onboarding/complete`
  - Zustand store for frontend state management (`organization-store.ts`)

### Directory Structure

```
desktop_app/src/
├── backend/
│   ├── clients/        # API clients (Podman integration)
│   ├── database/       # SQLite schema and migrations
│   ├── llms/          # LLM integrations and Ollama management
│   ├── mcpServer/     # MCP server implementation
│   ├── models/        # Data models
│   ├── sandbox/       # Container sandboxing logic
│   ├── server/        # Fastify server and plugins
│   └── utils/         # Utility functions (paths, binaries, etc.)
└── ui/
    ├── components/    # React components (don't modify ui/ subdirectory)
    ├── pages/        # Application pages
    ├── stores/       # Zustand state stores
    └── hooks/        # Custom React hooks
```

### Database Schema

Key tables (snake_case naming):

- `chats`, `messages`: Conversation storage
- `cloud_providers`: LLM provider configurations
- `mcp_servers`: Installed MCP servers
- `mcp_request_logs`: MCP activity logging
  - Tracks all MCP API requests and responses
  - Includes timing, status codes, headers, and payloads
  - Links to sessions and servers for comprehensive debugging
- `external_mcp_clients`: External MCP client configurations
- `organization`: Application organization settings
  - Tracks onboarding completion status
  - Stores telemetry opt-in preferences
  - Auto-created on application startup

### API Patterns

- **REST API**: Fastify server on port 2024
- **WebSocket**: Real-time communication for streaming responses
- **IPC**: Electron IPC for main-renderer communication
- **Generated Clients**: TypeScript clients from OpenAPI specs in `openapi/`

### MCP Server Management

- Servers installed to `~/Library/Application Support/archestra/mcp-servers/`
- Python servers use virtual environments
- Node.js servers use local node_modules
- Container-based execution with Podman

### Testing Patterns

- **Vitest** for all tests
- UI tests use jsdom environment
- Backend tests use node environment
- Test files colocated with source files (`.test.ts` extension)

### CI/CD Workflows

- **Linting and Tests**: Automated code quality checks
- **Build Desktop Application**: Multi-platform builds
- **Release Please**: Automated versioning and changelog
- **Claude Integration**: AI-powered PR reviews

### Development Notes

- Database file: `~/Library/Application Support/archestra/archestra.db`
- Logs directory: `~/Library/Application Support/archestra/logs/`
  - MCP server logs: `~/Library/Application Support/archestra/logs/<container-name>.log`
- Binary resources: `desktop_app/resources/bin/` (platform-specific)
- Code signing configured for macOS notarization
- ASAR packaging enabled for production builds

### macOS Code Signing

For macOS builds, the following environment variables are required:

- `APPLE_ID`: Apple ID email associated with your developer account
- `APPLE_PASSWORD`: App-specific password (generate at https://support.apple.com/102654)
- `APPLE_TEAM_ID`: Apple Team ID from https://developer.apple.com/account/#/membership
- `APPLE_CERTIFICATE_PASSWORD`: Password for the signing certificate

The build process automatically handles certificate installation and keychain cleanup.
