import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';

import { ConnectedMCPServer } from '../../../types';
import {
  ToolExecutionHistory,
  categorizeeTool,
  createMCPToolWrapper,
  createToolSelector,
  extractToolsFromServers,
  isToolSensitive,
} from '../mcp-tool-wrapper';

// Mock the MCP servers store
vi.mock('../../../stores/mcp-servers-store', () => ({
  useMCPServersStore: {
    getState: vi.fn(() => ({
      executeTool: vi.fn(async (serverName: string, request: any) => {
        return { result: `Executed ${request.name} on ${serverName}` };
      }),
    })),
  },
}));

describe('MCP Tool Wrapper', () => {
  describe('isToolSensitive', () => {
    it('should identify sensitive tools by pattern', () => {
      expect(isToolSensitive('file_write')).toBe(true);
      expect(isToolSensitive('delete_file')).toBe(true);
      expect(isToolSensitive('system_command')).toBe(true);
      expect(isToolSensitive('execute_script')).toBe(true);
      expect(isToolSensitive('read_file')).toBe(false);
      expect(isToolSensitive('search')).toBe(false);
    });
  });

  describe('categorizeeTool', () => {
    it('should categorize tools based on name and description', () => {
      expect(categorizeeTool('file_read', 'Read contents of a file')).toBe('file');
      expect(categorizeeTool('search_code', 'Search for code patterns')).toBe('search');
      expect(categorizeeTool('write_file', 'Write content to file')).toBe('write');
      expect(categorizeeTool('execute_command', 'Run shell command')).toBe('execute');
      expect(categorizeeTool('get_data', 'Fetch data from API')).toBe('read');
      expect(categorizeeTool('random_tool', 'Do something')).toBe('other');
    });
  });

  describe('createMCPToolWrapper', () => {
    const mockMCPTool: Tool = {
      name: 'read_file',
      description: 'Read the contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
        },
        required: ['path'],
      },
    };

    it('should create a wrapped tool with proper naming', () => {
      const wrapper = createMCPToolWrapper(mockMCPTool, 'test-server');

      expect(wrapper.tool.name).toBe('test-server_read_file');
      expect(wrapper.tool.description).toContain('[test-server]');
      expect(wrapper.tool.description).toContain('Read the contents of a file');
      expect(wrapper.serverName).toBe('test-server');
      expect(wrapper.category).toBe('file');
    });

    it('should not require approval for non-sensitive tools by default', () => {
      const wrapper = createMCPToolWrapper(mockMCPTool, 'test-server');
      expect(wrapper.tool.needsApproval).toBeUndefined();
    });

    it('should require approval for sensitive tools unless auto-approved', () => {
      const sensitiveTool: Tool = {
        name: 'write_file',
        description: 'Write content to a file',
        inputSchema: { type: 'object', properties: {} },
      };

      const wrapper = createMCPToolWrapper(sensitiveTool, 'test-server');
      expect(wrapper.tool.needsApproval).toBeDefined();

      const autoApprovedWrapper = createMCPToolWrapper(sensitiveTool, 'test-server', {
        autoApprove: true,
      });
      expect(autoApprovedWrapper.tool.needsApproval).toBeUndefined();
    });

    it('should execute tool through MCP store', async () => {
      const wrapper = createMCPToolWrapper(mockMCPTool, 'test-server');
      const result = await (wrapper.tool as any).execute({ path: '/test/file.txt' });

      expect(result).toEqual({ result: 'Executed read_file on test-server' });
    });
  });

  describe('extractToolsFromServers', () => {
    const mockServers: ConnectedMCPServer[] = [
      {
        name: 'server1',
        url: 'http://localhost:1234',
        client: null,
        status: 'connected',
        server_config: { transport: 'stdio' } as any,
        tools: [
          {
            name: 'read_file',
            description: 'Read file contents',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'write_file',
            description: 'Write file contents',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      },
      {
        name: 'server2',
        url: 'http://localhost:5678',
        client: null,
        status: 'connected',
        server_config: { transport: 'stdio' } as any,
        tools: [
          {
            name: 'search_code',
            description: 'Search for code patterns',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      },
      {
        name: 'server3',
        url: 'http://localhost:9999',
        client: null,
        status: 'error',
        server_config: { transport: 'stdio' } as any,
        tools: [],
      },
    ];

    it('should extract tools from connected servers only', () => {
      const tools = extractToolsFromServers(mockServers);

      expect(tools).toHaveLength(3); // 2 from server1, 1 from server2
      expect(tools[0].name).toBe('server1_read_file');
      expect(tools[1].name).toBe('server1_write_file');
      expect(tools[2].name).toBe('server2_search_code');
    });

    it('should apply auto-approval settings', () => {
      const tools = extractToolsFromServers(mockServers, {
        autoApproveCategories: ['read', 'search'],
        autoApproveServers: ['server2'],
      });

      // read_file should not require approval (category auto-approved)
      expect(tools[0].needsApproval).toBeUndefined();

      // write_file should require approval (sensitive, not auto-approved)
      expect(tools[1].needsApproval).toBeDefined();

      // search_code should not require approval (server auto-approved)
      expect(tools[2].needsApproval).toBeUndefined();
    });

    it('should use custom approval check when provided', () => {
      const customCheck = vi.fn(async () => false); // Always approve

      const tools = extractToolsFromServers(mockServers, {
        customApprovalCheck: customCheck,
      });

      // All sensitive tools should have needsApproval defined
      expect(tools[1].needsApproval).toBeDefined();
    });
  });

  describe('createToolSelector', () => {
    const mockWrappers = [
      createMCPToolWrapper(
        { name: 'read_file', description: 'Read file contents', inputSchema: { type: 'object' } },
        'server1'
      ),
      createMCPToolWrapper(
        { name: 'write_file', description: 'Write file contents', inputSchema: { type: 'object' } },
        'server1'
      ),
      createMCPToolWrapper(
        { name: 'search_code', description: 'Search for patterns', inputSchema: { type: 'object' } },
        'server2'
      ),
    ];

    it('should find tools by capability', () => {
      const selector = createToolSelector(mockWrappers);

      const fileTools = selector.findToolsForCapability('file');
      expect(fileTools).toHaveLength(2);
      expect(fileTools[0].mcpTool.name).toBe('read_file');
      expect(fileTools[1].mcpTool.name).toBe('write_file');

      const searchTools = selector.findToolsForCapability('search');
      expect(searchTools).toHaveLength(1);
      expect(searchTools[0].mcpTool.name).toBe('search_code');
    });

    it('should get tools by category', () => {
      const selector = createToolSelector(mockWrappers);

      const fileTools = selector.getToolsByCategory('file');
      expect(fileTools).toHaveLength(2);

      const searchTools = selector.getToolsByCategory('search');
      expect(searchTools).toHaveLength(1);
    });

    it('should get tools by server', () => {
      const selector = createToolSelector(mockWrappers);

      const server1Tools = selector.getToolsByServer('server1');
      expect(server1Tools).toHaveLength(2);

      const server2Tools = selector.getToolsByServer('server2');
      expect(server2Tools).toHaveLength(1);
    });

    it('should get sensitive tools', () => {
      const selector = createToolSelector(mockWrappers);

      const sensitiveTools = selector.getSensitiveTools();
      expect(sensitiveTools).toHaveLength(1);
      expect(sensitiveTools[0].mcpTool.name).toBe('write_file');
    });
  });

  describe('ToolExecutionHistory', () => {
    it('should track tool execution history', () => {
      const history = new ToolExecutionHistory();

      const toolCall1 = {
        id: '1',
        serverName: 'server1',
        toolName: 'read_file',
        arguments: { path: '/test.txt' },
        status: 'completed' as const,
        startTime: new Date(),
      };

      const toolCall2 = {
        id: '2',
        serverName: 'server2',
        toolName: 'search_code',
        arguments: { pattern: 'test' },
        status: 'error' as const,
        error: 'Pattern not found',
        startTime: new Date(),
      };

      history.add(toolCall1);
      history.add(toolCall2);

      expect(history.getRecentExecutions(5)).toHaveLength(2);
      expect(history.getExecutionsByServer('server1')).toHaveLength(1);
      expect(history.getExecutionsByTool('search_code')).toHaveLength(1);
      expect(history.getFailedExecutions()).toHaveLength(1);
    });

    it('should limit history size', () => {
      const history = new ToolExecutionHistory();

      // Add 150 items (exceeds max of 100)
      for (let i = 0; i < 150; i++) {
        history.add({
          id: `${i}`,
          serverName: 'test',
          toolName: 'test_tool',
          arguments: {},
          status: 'completed',
          startTime: new Date(),
        });
      }

      expect(history.getRecentExecutions(200)).toHaveLength(100);
    });

    it('should clear history', () => {
      const history = new ToolExecutionHistory();

      history.add({
        id: '1',
        serverName: 'test',
        toolName: 'test_tool',
        arguments: {},
        status: 'completed',
        startTime: new Date(),
      });

      expect(history.getRecentExecutions()).toHaveLength(1);
      history.clear();
      expect(history.getRecentExecutions()).toHaveLength(0);
    });
  });
});
