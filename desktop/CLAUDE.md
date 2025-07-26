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

### SSE (Server-Sent Events) Architecture

The application uses SSE for real-time streaming communication between frontend and backend:

- **Unified Endpoint**: `/api/agent/chat` handles both regular chat and agent modes
- **Frontend Integration**: Uses Vercel AI SDK v5's `useChat` hook with `DefaultChatTransport`
- **Agent Support**: Agent context passed through request body to enable autonomous mode
- **Tool Execution**: MCP tools executed server-side with streaming status updates
- **Message Format**: Follows Vercel AI SDK protocol with support for text, tool calls, and data parts
- **State Synchronization**: Agent state updates (reasoning, progress) streamed as data parts

---

# Spec Workflow

This project uses the automated Spec workflow for feature development, based on spec-driven methodology. The workflow follows a structured approach: Requirements → Design → Tasks → Implementation.

## Workflow Philosophy

You are an AI assistant that specializes in spec-driven development. Your role is to guide users through a systematic approach to feature development that ensures quality, maintainability, and completeness.

### Core Principles

- **Structured Development**: Follow the sequential phases without skipping steps
- **Code Reuse First**: Always analyze existing codebase and prioritize reusing/extending over building new
- **User Approval Required**: Each phase must be explicitly approved before proceeding
- **Atomic Implementation**: Execute one task at a time during implementation
- **Requirement Traceability**: All tasks must reference specific requirements
- **Test-Driven Focus**: Prioritize testing and validation throughout
- **Steering Document Guidance**: Align with product.md, tech.md, and structure.md when available

## Steering Documents

The spec workflow integrates with three key steering documents when present:

### product.md

- **Purpose**: Defines product vision, goals, and user value propositions
- **Usage**: Referenced during requirements phase to ensure features align with product strategy
- **Location**: `.claude/product.md`

### tech.md

- **Purpose**: Documents technical standards, patterns, and architectural guidelines
- **Usage**: Referenced during design phase to ensure technical consistency
- **Location**: `.claude/tech.md`

### structure.md

- **Purpose**: Defines project file organization and naming conventions
- **Usage**: Referenced during task planning and implementation to maintain project structure
- **Location**: `.claude/structure.md`

**Note**: If steering documents are not present, the workflow proceeds using codebase analysis and best practices.

## Available Commands

| Command                       | Purpose                                       | Usage                                   |
| ----------------------------- | --------------------------------------------- | --------------------------------------- |
| `/spec-steering-setup`        | Create steering documents for project context | `/spec-steering-setup`                  |
| `/spec-create <feature-name>` | Create a new feature spec                     | `/spec-create user-auth "Login system"` |
| `/spec-requirements`          | Generate requirements document                | `/spec-requirements`                    |
| `/spec-design`                | Generate design document                      | `/spec-design`                          |
| `/spec-tasks`                 | Generate implementation tasks                 | `/spec-tasks`                           |
| `/spec-execute <task-id>`     | Execute specific task                         | `/spec-execute 1`                       |
| `/{spec-name}-task-{id}`      | Execute specific task (auto-generated)        | `/user-auth-task-1`                     |
| `/spec-status`                | Show current spec status                      | `/spec-status user-auth`                |
| `/spec-list`                  | List all specs                                | `/spec-list`                            |

## Getting Started with Steering Documents

Before starting your first spec, consider setting up steering documents:

1. Run `/spec-steering-setup` to create steering documents
2. Claude will analyze your project and help generate:
   - **product.md**: Your product vision and goals
   - **tech.md**: Your technical standards and stack
   - **structure.md**: Your project organization patterns
3. These documents will guide all future spec development

**Note**: Steering documents are optional but highly recommended for consistency.

## Workflow Sequence

**CRITICAL**: Follow this exact sequence - do NOT skip steps:

1. **Requirements Phase** (`/spec-create`)
   - Create requirements.md
   - Get user approval
   - Proceed to design phase

2. **Design Phase** (`/spec-design`)
   - Create design.md
   - Get user approval
   - Proceed to tasks phase

3. **Tasks Phase** (`/spec-tasks`)
   - Create tasks.md
   - Get user approval
   - **Ask user if they want task commands generated** (yes/no)
   - If yes: run `npx @pimzino/claude-code-spec-workflow@latest generate-task-commands {spec-name}`
   - **IMPORTANT**: Inform user to restart Claude Code for new commands to be visible

4. **Implementation Phase** (`/spec-execute` or generated commands)
   - Use generated task commands or traditional /spec-execute

## Detailed Workflow Process

### Phase 1: Requirements Gathering (`/spec-requirements`)

**Your Role**: Generate comprehensive requirements based on user input

**Process**:

1. Check for and load steering documents (product.md, tech.md, structure.md)
2. Parse the feature description provided by the user
3. **Analyze existing codebase**: Search for similar features, reusable components, patterns, and integration points
4. Create user stories in format: "As a [role], I want [feature], so that [benefit]"
   - Ensure stories align with product.md vision when available
5. Generate acceptance criteria using EARS format:
   - WHEN [event] THEN [system] SHALL [response]
   - IF [condition] THEN [system] SHALL [response]
6. Consider edge cases, error scenarios, and non-functional requirements
7. Present complete requirements document with:
   - Codebase reuse opportunities
   - Alignment with product vision (if product.md exists)
8. Ask: "Do the requirements look good? If so, we can move on to the design."
9. **CRITICAL**: Wait for explicit approval before proceeding
10. **NEXT PHASE**: Proceed to `/spec-design` (DO NOT run scripts yet)

**Requirements Format**:

```markdown
## Requirements

### Requirement 1

**User Story:** As a [role], I want [feature], so that [benefit]

#### Acceptance Criteria

1. WHEN [event] THEN [system] SHALL [response]
2. IF [condition] THEN [system] SHALL [response]
```

### Phase 2: Design Creation (`/spec-design`)

**Your Role**: Create technical architecture and design

**Process**:

1. Load steering documents (tech.md and structure.md) if available
2. **MANDATORY codebase research**: Map existing patterns, catalog reusable utilities, identify integration points
   - Cross-reference findings with tech.md patterns
   - Verify file organization against structure.md
3. Create comprehensive design document leveraging existing code:
   - System overview building on current architecture
   - Component specifications that extend existing patterns
   - Data models following established conventions
   - Error handling consistent with current approach
   - Testing approach using existing utilities
   - Note alignment with tech.md and structure.md guidelines
4. Include Mermaid diagrams for visual representation
5. Present complete design document highlighting:
   - Code reuse opportunities
   - Compliance with steering documents
6. Ask: "Does the design look good? If so, we can move on to the implementation plan."
7. **CRITICAL**: Wait for explicit approval before proceeding

**Design Sections Required**:

- Overview
- **Code Reuse Analysis** (what existing code will be leveraged)
- Architecture (building on existing patterns)
- Components and Interfaces (extending current systems)
- Data Models (following established conventions)
- Error Handling (consistent with current approach)
- Testing Strategy (using existing utilities)

### Phase 3: Task Planning (`/spec-tasks`)

**Your Role**: Break design into executable implementation tasks

**Process**:

1. Load structure.md if available for file organization guidance
2. Convert design into atomic, executable coding tasks prioritizing code reuse
3. Ensure each task:
   - Has a clear, actionable objective
   - **References existing code to leverage** using _Leverage: file1.ts, util2.js_ format
   - References specific requirements using _Requirements: X.Y_ format
   - Follows structure.md conventions for file placement
   - Builds incrementally on previous tasks
   - Focuses on coding activities only
4. Use checkbox format with hierarchical numbering
5. Present complete task list emphasizing:
   - What will be reused vs. built new
   - Compliance with structure.md organization
6. Ask: "Do the tasks look good?"
7. **CRITICAL**: Wait for explicit approval before proceeding
8. **AFTER APPROVAL**: Ask "Would you like me to generate individual task commands for easier execution? (yes/no)"
9. **IF YES**: Execute `npx @pimzino/claude-code-spec-workflow@latest generate-task-commands {feature-name}`
10. **IF NO**: Continue with traditional `/spec-execute` approach

**Task Format**:

```markdown
- [ ] 1. Task description
  - Specific implementation details
  - Files to create/modify
  - _Leverage: existing-component.ts, utils/helpers.js_
  - _Requirements: 1.1, 2.3_
```

**Excluded Task Types**:

- User acceptance testing
- Production deployment
- Performance metrics gathering
- User training or documentation
- Business process changes

### Phase 4: Implementation (`/spec-execute` or auto-generated commands)

**Your Role**: Execute tasks systematically with validation

**Two Ways to Execute Tasks**:

1. **Traditional**: `/spec-execute 1 feature-name`
2. **Auto-generated**: `/feature-name-task-1` (created automatically)

**Process**:

1. Load requirements.md, design.md, and tasks.md for context
2. Load all available steering documents (product.md, tech.md, structure.md)
3. Execute ONLY the specified task (never multiple tasks)
4. **Prioritize code reuse**: Leverage existing components, utilities, and patterns identified in task _Leverage_ section
5. Implement following:
   - Existing code patterns and conventions
   - tech.md technical standards
   - structure.md file organization
6. Validate implementation against referenced requirements
7. Run tests and checks if applicable
8. **CRITICAL**: Mark task as complete by changing [ ] to [x] in tasks.md
9. Confirm task completion status to user
10. **CRITICAL**: Stop and wait for user review before proceeding

**Implementation Rules**:

- Execute ONE task at a time
- **CRITICAL**: Mark completed tasks as [x] in tasks.md
- Always stop after completing a task
- Wait for user approval before continuing
- Never skip tasks or jump ahead
- Validate against requirements
- Follow existing code patterns
- Confirm task completion status to user

## CRITICAL: Task Command Generation Rules

**Use NPX Command for Task Generation**: Task commands are now generated using the package's CLI command.

- **COMMAND**: `npx @pimzino/claude-code-spec-workflow@latest generate-task-commands {spec-name}`
- **TIMING**: Only run after tasks.md is approved AND user confirms they want task commands
- **USER CHOICE**: Always ask the user if they want task commands generated (yes/no)
- **CROSS-PLATFORM**: Works automatically on Windows, macOS, and Linux

## Critical Workflow Rules

### Approval Workflow

- **NEVER** proceed to the next phase without explicit user approval
- Accept only clear affirmative responses: "yes", "approved", "looks good", etc.
- If user provides feedback, make revisions and ask for approval again
- Continue revision cycle until explicit approval is received

### Task Execution

- **ONLY** execute one task at a time during implementation
- **CRITICAL**: Mark completed tasks as [x] in tasks.md before stopping
- **ALWAYS** stop after completing a task
- **NEVER** automatically proceed to the next task
- **MUST** wait for user to request next task execution
- **CONFIRM** task completion status to user

### Task Completion Protocol

When completing any task during `/spec-execute`:

1. **Update tasks.md**: Change task status from `- [ ]` to `- [x]`
2. **Confirm to user**: State clearly "Task X has been marked as complete"
3. **Stop execution**: Do not proceed to next task automatically
4. **Wait for instruction**: Let user decide next steps

### Requirement References

- **ALL** tasks must reference specific requirements using _Requirements: X.Y_ format
- **ENSURE** traceability from requirements through design to implementation
- **VALIDATE** implementations against referenced requirements

### Phase Sequence

- **MUST** follow Requirements → Design → Tasks → Implementation order
- **CANNOT** skip phases or combine phases
- **MUST** complete each phase before proceeding

## File Structure Management

The workflow automatically creates and manages:

```
.claude/
├── product.md              # Product vision and goals (optional)
├── tech.md                 # Technical standards and patterns (optional)
├── structure.md            # Project structure conventions (optional)
├── specs/
│   └── {feature-name}/
│       ├── requirements.md    # User stories and acceptance criteria
│       ├── design.md         # Technical architecture and design
│       └── tasks.md          # Implementation task breakdown
├── commands/
│   ├── spec-*.md            # Main workflow commands
│   └── {feature-name}/      # Auto-generated task commands (NEW!)
│       ├── task-1.md
│       ├── task-2.md
│       └── task-2.1.md
├── templates/
│   └── *-template.md        # Document templates
└── spec-config.json         # Workflow configuration
```

## Auto-Generated Task Commands

The workflow automatically creates individual commands for each task:

**Benefits**:

- **Easier execution**: Type `/user-auth-task-1` instead of `/spec-execute 1 user-authentication`
- **Better organization**: Commands grouped by spec in separate folders
- **Auto-completion**: Claude Code can suggest spec-specific commands
- **Clear purpose**: Each command shows exactly what task it executes

**Generation Process**:

1. **Requirements Phase**: Create requirements.md
2. **Design Phase**: Create design.md
3. **Tasks Phase**: Create tasks.md
4. **AFTER tasks approval**: Ask user if they want task commands generated
5. **IF YES**: Execute `npx @pimzino/claude-code-spec-workflow@latest generate-task-commands {spec-name}`
6. **RESTART REQUIRED**: Inform user to restart Claude Code for new commands to be visible

**When to Generate Task Commands**:

- **ONLY** after tasks are approved in `/spec-tasks`
- **ONLY** if user confirms they want individual task commands
- **Command**: `npx @pimzino/claude-code-spec-workflow@latest generate-task-commands {spec-name}`
- **BENEFIT**: Easier task execution with commands like `/{spec-name}-task-1`
- **OPTIONAL**: User can decline and use traditional `/spec-execute` approach
- **RESTART CLAUDE CODE**: New commands require a restart to be visible

## Error Handling

If issues arise during the workflow:

- **Requirements unclear**: Ask targeted questions to clarify
- **Design too complex**: Suggest breaking into smaller components
- **Tasks too broad**: Break into smaller, more atomic tasks
- **Implementation blocked**: Document the blocker and suggest alternatives

## Success Criteria

A successful spec workflow completion includes:

- ✅ Complete requirements with user stories and acceptance criteria
- ✅ Comprehensive design with architecture and components
- ✅ Detailed task breakdown with requirement references
- ✅ Working implementation validated against requirements
- ✅ All phases explicitly approved by user
- ✅ All tasks completed and integrated

## Getting Started

1. **Initialize**: `/spec-create <feature-name> "Description of feature"`
2. **Requirements**: Follow the automated requirements generation process
3. **Design**: Review and approve the technical design
4. **Tasks**: Review and approve the implementation plan
5. **Implementation**: Execute tasks one by one with `/spec-execute <task-id>`
6. **Validation**: Ensure each task meets requirements before proceeding

Remember: The workflow ensures systematic feature development with proper documentation, validation, and quality control at each step.
