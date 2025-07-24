# Project Overview

Archestra AI is a **Tauri desktop application** that integrates AI/LLM capabilities with MCP (Model Context Protocol) support. It provides a privacy-focused AI assistant with extensible tool support through MCP servers.

## Technology Stack

### Frontend

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS with shadcn/ui components
- **State Management**: Zustand stores
- **API Client**: Auto-generated from OpenAPI schema using @hey-api/openapi-ts
- **Testing**: Vitest with React Testing Library

### Backend

- **Framework**: Tauri (Rust)
- **Database**: SQLite with SeaORM ORM
- **API**: HTTP gateway on port 54587 with OpenAPI documentation (utoipa)
- **Testing**: Rust's built-in test framework with rstest fixtures

### AI Integration

- **Local LLM**: Ollama integration for privacy-focused AI
- **Protocol**: MCP (Model Context Protocol) for tool integration
- **Security**: macOS sandbox profiles for MCP server execution

## Code Style Guidelines

### TypeScript/React

- Use functional components with TypeScript
- Prefer `interface` over `type` for object shapes
- Use absolute imports with `@/` prefix (maps to `./src/`)
- Follow existing component patterns in `src/components/`
- State management through Zustand stores in `src/stores/`
- API calls through generated client in `src/lib/api-client.ts`

### Rust

- Follow Rust naming conventions (snake_case for functions/variables)
- Use `Result<T, E>` for error handling
- Implement proper error types for each module
- Use SeaORM for database operations
- Add utoipa annotations for API endpoints under `/api`
- Write tests using rstest fixtures from `test_fixtures`

### Testing

- Frontend: Write tests alongside components using `.test.tsx` extension
- Backend: Include tests in the same file under `#[cfg(test)] mod tests`
- Use descriptive test names that explain the scenario being tested
- Mock external dependencies appropriately

## Common Patterns

### API Endpoints (Rust)

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
    service.get_resources()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
```

### Frontend API Calls

```typescript
import { apiClient } from "@/lib/api-client";

// Use the generated API client
const response = await apiClient.getResources();
if (response.data) {
  // Handle success
}
```

### Zustand Store Pattern

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

## Important Commands

### Development

- `pnpm install` - Install dependencies
- `pnpm tauri dev` - Run the full application
- `pnpm dev` - Run frontend only
- `pnpm test` - Run frontend tests
- `cd src-tauri && cargo test` - Run backend tests

### Code Generation

- `cd src-tauri && cargo run --bin dump_openapi` - Generate OpenAPI schema
- `pnpm codegen` - Generate TypeScript client from OpenAPI schema

### Code Quality

- `pnpm prettier` - Format frontend code
- `cd src-tauri && cargo fmt` - Format Rust code
- `cd src-tauri && cargo clippy` - Lint Rust code

## File Structure

### Frontend (`desktop/src/`)

- `components/` - Reusable UI components
  - `ui/` - Base UI components (shadcn/ui)
  - `kibo/` - AI-specific components
- `pages/` - Main application pages
- `stores/` - Zustand state management
- `hooks/` - Custom React hooks
- `lib/api/` - Generated API client (do not edit)
- `lib/api-client.ts` - Configured API client instance

### Backend (`desktop/src-tauri/src/`)

- `database/` - SeaORM entities and migrations
- `models/` - Business logic and data models
- `gateway/` - HTTP API endpoints
  - `api/` - REST endpoints (OpenAPI documented)
  - `mcp.rs` - MCP server endpoints
  - `mcp_proxy.rs` - MCP request proxy
  - `llm_providers/` - LLM provider proxies
- `openapi.rs` - OpenAPI documentation configuration

## Key Considerations

1. **API Changes**: After modifying API endpoints, always regenerate the OpenAPI schema and TypeScript client
2. **Type Safety**: Leverage TypeScript's type system and Rust's strong typing
3. **Error Handling**: Use proper error types and handle errors gracefully
4. **Testing**: Write tests for new features and bug fixes
5. **Security**: Be mindful of security when handling MCP servers and OAuth flows
6. **Performance**: Consider performance implications for database queries and API calls

## Common Gotchas

- The gateway runs on port 54587 (configured in `src/consts.ts`)
- OpenAPI schema must be kept in sync with code (CI will fail otherwise)
- Use `pnpm` not `npm` or `yarn`
- Frontend API calls should use the generated client, not Tauri commands
- Database migrations should be created for schema changes
- MCP servers run in sandboxed environments on macOS

## Testing Guidelines

- Mock external dependencies in tests
- Use rstest fixtures for Rust database tests
- Test both success and error cases
- Include edge cases in test coverage
- Run tests before committing changes

## Contributing

When contributing to this codebase:

1. Follow the existing code style and patterns
2. Update tests for any behavioral changes
3. Regenerate OpenAPI schema if API changes are made
4. Ensure all tests pass before submitting PR
5. Keep commits focused and descriptive
