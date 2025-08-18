import { type AvailableTool as Tool } from '@ui/lib/clients/archestra/api/gen';

/**
 * TODO: what is the proper type on this? It used to be this👇
 *
 * import type { ToolCall as ServerToolCallRepresentation } from '@clients/archestra/api/gen';
 *
 * However, we're no longer exporting a ToolCall type as part of the API's openapi schema.
 * We used to do this with the Rust backend.. what does a ToolCall represent now?
 *
 * Two approaches we can take here:
 * 1. Import the type from the relevant (which one?) package
 * 2. Generate the zod schema/type on the backend, and "register" it as a "component" in the openapi spec
 * such that it would get codegen'd into @clients/archestra/api/gen/types.gen.ts
 * (see calls to z.globalRegistry.add for an example of how to do this)
 */
export type ServerToolCallRepresentation = any;

export enum ToolCallStatus {
  Pending = 'pending',
  Executing = 'executing',
  Completed = 'completed',
  Error = 'error',
}

export interface ToolCall extends ServerToolCallRepresentation {
  id: string;
  serverName: string;
  name: string;
  arguments: Record<string, any>;
  result: string;
  error: string | null;
  status: ToolCallStatus;
  executionTime: number | null;
  startTime: Date | null;
  endTime: Date | null;
}

export type ToolsByServer = Record<string, Tool[]>;
export type AvailableToolsMap = Record<string, Tool>;
export type ToolChoice = 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string };

export { Tool };
