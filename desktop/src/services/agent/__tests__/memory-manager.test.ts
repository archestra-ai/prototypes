import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryEntry } from '../../../types/agent';
import { MemoryManager } from '../memory-manager';

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  const sessionId = 'test-session-id';

  beforeEach(() => {
    memoryManager = new MemoryManager(sessionId, {
      maxEntries: 100,
      ttlSeconds: 3600,
      summarizationThreshold: 0.8,
      maxSizeInBytes: 1024 * 1024, // 1MB
    });
  });

  describe('addEntry', () => {
    it('should add a new memory entry', () => {
      const entry = memoryManager.addEntry('observation', 'Test observation', { key: 'value' });

      expect(entry).toBeDefined();
      expect(entry.type).toBe('observation');
      expect(entry.content).toBe('Test observation');
      expect(entry.metadata).toEqual({ key: 'value' });
      expect(entry.relevanceScore).toBe(1.0);
    });

    it('should update working memory size', () => {
      const initialStats = memoryManager.getStatistics();
      expect(initialStats.sizeInBytes).toBe(0);

      memoryManager.addEntry('observation', 'Test observation');

      const updatedStats = memoryManager.getStatistics();
      expect(updatedStats.sizeInBytes).toBeGreaterThan(0);
    });

    it('should handle references between entries', () => {
      const entry1 = memoryManager.addEntry('observation', 'First observation');
      const entry2 = memoryManager.addEntry('decision', 'Decision based on observation', {}, [entry1.id]);

      expect(entry2.references).toContain(entry1.id);

      const related = memoryManager.getRelatedMemories(entry1.id);
      expect(related).toHaveLength(1);
      expect(related[0].id).toBe(entry2.id);
    });
  });

  describe('searchMemories', () => {
    beforeEach(() => {
      // Add various test entries
      memoryManager.addEntry('observation', 'User requested feature X');
      memoryManager.addEntry('decision', 'Implementing feature X with approach Y');
      memoryManager.addEntry('result', 'Feature X implemented successfully');
      memoryManager.addEntry('error', 'Failed to connect to database');
    });

    it('should search by type', () => {
      const results = memoryManager.searchMemories({ types: ['observation'] });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('observation');
    });

    it('should search by keywords', () => {
      const results = memoryManager.searchMemories({ keywords: ['feature'] });
      expect(results).toHaveLength(3);
      // Check that all results contain 'feature' (case-insensitive)
      results.forEach((r) => {
        expect(r.content.toLowerCase()).toContain('feature');
      });
    });

    it('should apply relevance score filter', () => {
      const results = memoryManager.searchMemories({ minRelevanceScore: 0.5 });
      expect(results.every((r) => r.relevanceScore >= 0.5)).toBe(true);
    });

    it('should limit results', () => {
      const results = memoryManager.searchMemories({ limit: 2 });
      expect(results).toHaveLength(2);
    });
  });

  describe('memory limits', () => {
    it('should enforce entry count limit', () => {
      const smallMemoryManager = new MemoryManager(sessionId, {
        maxEntries: 5,
        ttlSeconds: 3600,
      });

      // Add more entries than the limit
      for (let i = 0; i < 10; i++) {
        smallMemoryManager.addEntry('observation', `Entry ${i}`);
      }

      const stats = smallMemoryManager.getStatistics();
      expect(stats.totalEntries).toBeLessThanOrEqual(5);
    });

    it('should remove expired entries', () => {
      const shortTTLManager = new MemoryManager(sessionId, {
        maxEntries: 100,
        ttlSeconds: 1, // 1 second TTL
      });

      shortTTLManager.addEntry('observation', 'Will expire soon');

      // Wait for expiration
      vi.useFakeTimers();
      vi.advanceTimersByTime(2000); // 2 seconds

      shortTTLManager.addEntry('observation', 'New entry triggers cleanup');

      const stats = shortTTLManager.getStatistics();
      expect(stats.totalEntries).toBe(1); // Only the new entry

      vi.useRealTimers();
    });
  });

  describe('getContext', () => {
    it('should return formatted context string', () => {
      memoryManager.addEntry('observation', 'User wants to create a component');
      memoryManager.addEntry('decision', 'Creating React component');
      memoryManager.addEntry('result', 'Component created successfully');

      const context = memoryManager.getContext();

      expect(context).toContain('[observation]');
      expect(context).toContain('[decision]');
      expect(context).toContain('[result]');
      expect(context).toContain('User wants to create a component');
    });

    it('should respect token limit', () => {
      // Add many entries
      for (let i = 0; i < 50; i++) {
        memoryManager.addEntry('observation', `This is a very long observation number ${i} with lots of text`);
      }

      const context = memoryManager.getContext(100); // Very small limit
      expect(context.length).toBeLessThan(200); // Some buffer for formatting
    });
  });

  describe('summarizeMemory', () => {
    it('should create summary when threshold is reached', async () => {
      const manager = new MemoryManager(sessionId, {
        maxEntries: 10,
        summarizationThreshold: 0.5, // 50%
      });

      // Fill to 60% capacity
      for (let i = 0; i < 6; i++) {
        manager.addEntry('observation', `Observation about feature ${i}`);
      }

      const summary = await manager.summarizeMemory();
      expect(summary).toBeDefined();
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should not summarize below threshold', async () => {
      const manager = new MemoryManager(sessionId, {
        maxEntries: 10,
        summarizationThreshold: 0.8,
      });

      // Only 30% capacity
      for (let i = 0; i < 3; i++) {
        manager.addEntry('observation', `Observation ${i}`);
      }

      const summary = await manager.summarizeMemory();
      expect(summary).toBe('');
    });
  });

  describe('relevance scoring', () => {
    it('should calculate relevance based on context', () => {
      const entry = memoryManager.addEntry('observation', 'Working on authentication feature');

      const relevance1 = memoryManager.calculateRelevanceScore(entry, 'authentication login');
      const relevance2 = memoryManager.calculateRelevanceScore(entry, 'unrelated topic');

      expect(relevance1).toBeGreaterThan(relevance2);
    });

    it('should decay relevance over time', () => {
      vi.useFakeTimers();

      const entry = memoryManager.addEntry('observation', 'Test observation');
      const initialRelevance = memoryManager.calculateRelevanceScore(entry);

      vi.advanceTimersByTime(1800000); // 30 minutes

      const laterRelevance = memoryManager.calculateRelevanceScore(entry);
      expect(laterRelevance).toBeLessThan(initialRelevance);

      vi.useRealTimers();
    });
  });

  describe('export/import', () => {
    it('should export and import memory state', () => {
      // Add some entries
      memoryManager.addEntry('observation', 'Test 1');
      memoryManager.addEntry('decision', 'Test 2');

      const exported = memoryManager.exportMemory();
      expect(exported.entries).toHaveLength(2);

      // Create new manager and import
      const newManager = new MemoryManager('new-session');
      newManager.importMemory(exported);

      const stats = newManager.getStatistics();
      expect(stats.totalEntries).toBe(2);
    });
  });

  describe('getStatistics', () => {
    it('should return comprehensive statistics', () => {
      memoryManager.addEntry('observation', 'Test observation');
      memoryManager.addEntry('decision', 'Test decision');
      memoryManager.addEntry('result', 'Test result');
      memoryManager.addEntry('error', 'Test error');

      const stats = memoryManager.getStatistics();

      expect(stats.totalEntries).toBe(4);
      expect(stats.typeDistribution.observation).toBe(1);
      expect(stats.typeDistribution.decision).toBe(1);
      expect(stats.typeDistribution.result).toBe(1);
      expect(stats.typeDistribution.error).toBe(1);
      expect(stats.topKeywords).toBeDefined();
      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
    });
  });
});
