import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentError } from '@/types/agent';

import {
  HumanInLoopHandler,
  ToolApprovalResult,
  createConsoleApprovalHandler,
  createUIApprovalHandler,
} from '../human-in-loop';

describe('HumanInLoopHandler', () => {
  let handler: HumanInLoopHandler;
  let mockApprovalCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockApprovalCallback = vi.fn();
    handler = new HumanInLoopHandler({
      requestApproval: mockApprovalCallback,
      defaultTimeout: 1000, // 1 second for tests
      autoApproveCategories: ['read', 'search'],
      autoApproveServers: ['test-server'],
      rememberDecisions: true,
      maxPendingRequests: 3,
    });
  });

  describe('requiresApproval', () => {
    it('should not require approval for auto-approved categories', async () => {
      const result = await handler.requiresApproval(
        'read_file',
        'any-server',
        { path: '/test.txt' },
        'Read file contents'
      );
      expect(result).toBe(false);
    });

    it('should not require approval for auto-approved servers', async () => {
      const result = await handler.requiresApproval(
        'write_file',
        'test-server',
        { path: '/test.txt', content: 'data' },
        'Write file contents'
      );
      expect(result).toBe(false);
    });

    it('should require approval for sensitive tools', async () => {
      const result = await handler.requiresApproval('delete_file', 'other-server', { path: '/test.txt' });
      expect(result).toBe(true);
    });

    it('should require approval for non-auto-approved tools', async () => {
      const result = await handler.requiresApproval('custom_tool', 'other-server', { data: 'test' });
      expect(result).toBe(true);
    });

    it('should use cached decisions when remember is enabled', async () => {
      // First request - should require approval
      mockApprovalCallback.mockResolvedValueOnce({
        requestId: '1',
        approved: true,
        timestamp: new Date(),
        rememberDecision: true,
      });

      const firstResult = await handler.requiresApproval('custom_tool', 'server1', { data: 'test' });
      expect(firstResult).toBe(true);

      // Request approval
      await handler.requestApproval('custom_tool', 'server1', { data: 'test' });

      // Second request - should not require approval (cached)
      const secondResult = await handler.requiresApproval('custom_tool', 'server1', { data: 'test' });
      expect(secondResult).toBe(false);
    });
  });

  describe('requestApproval', () => {
    it('should request approval and return result', async () => {
      const mockResult: ToolApprovalResult = {
        requestId: 'test-id',
        approved: true,
        reason: 'Test approval',
        timestamp: new Date(),
        rememberDecision: false,
      };

      mockApprovalCallback.mockResolvedValueOnce(mockResult);

      const result = await handler.requestApproval(
        'test_tool',
        'test_server',
        { arg: 'value' },
        { description: 'Test tool' }
      );

      expect(mockApprovalCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'test_tool',
          serverName: 'test_server',
          arguments: { arg: 'value' },
          description: 'Test tool',
        })
      );

      expect(result.approved).toBe(true);
      expect(result.reason).toBe('Test approval');
    });

    it('should timeout if no response within timeout period', async () => {
      mockApprovalCallback.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 2000)));

      await expect(
        handler.requestApproval(
          'test_tool',
          'test_server',
          {},
          { timeout: 100 } // 100ms timeout
        )
      ).rejects.toThrow(AgentError);
    });

    it('should enforce max pending requests limit', async () => {
      // Fill up pending requests
      const pendingPromises = [];
      for (let i = 0; i < 3; i++) {
        mockApprovalCallback.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));
        pendingPromises.push(handler.requestApproval(`tool${i}`, 'server', {}));
      }

      // Fourth request should fail
      await expect(handler.requestApproval('tool4', 'server', {})).rejects.toThrow(
        'Too many pending approval requests'
      );

      // Clean up
      pendingPromises.forEach((p) => p.catch(() => {}));
    });

    it('should store approval in history', async () => {
      const mockResult: ToolApprovalResult = {
        requestId: 'test-id',
        approved: true,
        timestamp: new Date(),
      };

      mockApprovalCallback.mockResolvedValueOnce(mockResult);
      await handler.requestApproval('test_tool', 'server', {});

      const history = handler.getApprovalHistory();
      expect(history).toHaveLength(1);
      expect(history[0].approved).toBe(true);
    });
  });

  describe('handleBatchApprovals', () => {
    it('should process multiple approval requests', async () => {
      mockApprovalCallback
        .mockResolvedValueOnce({
          requestId: '1',
          approved: true,
          timestamp: new Date(),
        })
        .mockResolvedValueOnce({
          requestId: '2',
          approved: true,
          timestamp: new Date(),
        })
        .mockResolvedValueOnce({
          requestId: '3',
          approved: false,
          reason: 'Rejected',
          timestamp: new Date(),
        });

      const requests = [
        { toolName: 'tool1', serverName: 'server1', args: {} },
        { toolName: 'tool2', serverName: 'server2', args: {} },
        { toolName: 'tool3', serverName: 'server3', args: {} },
      ];

      const results = await handler.handleBatchApprovals(requests);

      expect(results).toHaveLength(3);
      expect(results[0].approved).toBe(true);
      expect(results[1].approved).toBe(true);
      expect(results[2].approved).toBe(false);
    });

    it('should cancel remaining requests if user cancels all', async () => {
      mockApprovalCallback.mockResolvedValueOnce({
        requestId: '1',
        approved: false,
        reason: 'cancel all',
        timestamp: new Date(),
      });

      const requests = [
        { toolName: 'tool1', serverName: 'server1', args: {} },
        { toolName: 'tool2', serverName: 'server2', args: {} },
        { toolName: 'tool3', serverName: 'server3', args: {} },
      ];

      const results = await handler.handleBatchApprovals(requests);

      expect(results).toHaveLength(3);
      expect(results.every((r) => !r.approved)).toBe(true);
      expect(mockApprovalCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('decision caching', () => {
    it('should cache and reuse approval decisions', async () => {
      mockApprovalCallback.mockResolvedValueOnce({
        requestId: '1',
        approved: true,
        timestamp: new Date(),
        rememberDecision: true,
      });

      // First request
      await handler.requestApproval('tool1', 'server1', { arg: 'value' });

      // Check that decision is cached
      const requiresApproval = await handler.requiresApproval('tool1', 'server1', { arg: 'value' });
      expect(requiresApproval).toBe(false);
    });

    it('should clear decision cache when requested', async () => {
      mockApprovalCallback.mockResolvedValueOnce({
        requestId: '1',
        approved: true,
        timestamp: new Date(),
        rememberDecision: true,
      });

      await handler.requestApproval('tool1', 'server1', {});
      handler.clearDecisionCache();

      const requiresApproval = await handler.requiresApproval('tool1', 'server1', {});
      expect(requiresApproval).toBe(true);
    });
  });

  describe('statistics', () => {
    it('should track approval statistics', async () => {
      mockApprovalCallback
        .mockResolvedValueOnce({
          requestId: '1',
          approved: true,
          timestamp: new Date(),
        })
        .mockResolvedValueOnce({
          requestId: '2',
          approved: false,
          timestamp: new Date(),
        });

      await handler.requestApproval('tool1', 'server1', {});
      await handler.requestApproval('tool2', 'server2', {});

      const stats = handler.getStatistics();
      expect(stats.totalRequests).toBe(2);
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.approvalRate).toBe(0.5);
    });
  });

  describe('auto-approval settings', () => {
    it('should update auto-approval settings', async () => {
      handler.updateAutoApprovalSettings({
        categories: ['write', 'execute'],
        servers: ['new-server'],
      });

      const requiresApproval = await handler.requiresApproval('write_file', 'new-server', {});
      expect(requiresApproval).toBe(false);
    });
  });

  describe('pending requests', () => {
    it('should track pending requests', async () => {
      mockApprovalCallback.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));

      const promise = handler.requestApproval('tool1', 'server1', {});

      const pending = handler.getPendingRequests();
      expect(pending).toHaveLength(1);
      expect(pending[0].toolName).toBe('tool1');

      // Clean up
      promise.catch(() => {});
    });

    it('should allow cancelling pending requests', async () => {
      mockApprovalCallback.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));

      const promise = handler.requestApproval('tool1', 'server1', {});
      const pending = handler.getPendingRequests();

      const cancelled = handler.cancelRequest(pending[0].id);
      expect(cancelled).toBe(true);

      // Clean up
      promise.catch(() => {});
    });
  });

  describe('export functionality', () => {
    it('should export approval history', async () => {
      mockApprovalCallback.mockResolvedValueOnce({
        requestId: '1',
        approved: true,
        timestamp: new Date(),
      });

      await handler.requestApproval('tool1', 'server1', {});

      const exported = handler.exportHistory();
      const data = JSON.parse(exported);

      expect(data.history).toHaveLength(1);
      expect(data.statistics).toBeDefined();
      expect(data.exportedAt).toBeDefined();
    });
  });

  describe('factory functions', () => {
    it('should create console approval handler', () => {
      const consoleHandler = createConsoleApprovalHandler();
      expect(consoleHandler).toBeInstanceOf(HumanInLoopHandler);
    });

    it('should create UI approval handler', () => {
      const mockDialog = vi.fn();
      const uiHandler = createUIApprovalHandler(mockDialog);
      expect(uiHandler).toBeInstanceOf(HumanInLoopHandler);
    });
  });
});
