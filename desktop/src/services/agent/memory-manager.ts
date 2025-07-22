import { MemoryEntry, WorkingMemory } from '../../types/agent';

// Configuration for memory management
export interface MemoryConfig {
  maxEntries: number;
  ttlSeconds: number;
  summarizationThreshold: number;
  maxSizeInBytes: number;
  relevanceDecayRate: number;
}

// Memory search criteria
export interface MemorySearchCriteria {
  types?: MemoryEntry['type'][];
  minRelevanceScore?: number;
  startTime?: Date;
  endTime?: Date;
  keywords?: string[];
  limit?: number;
}

// Memory summary
export interface MemorySummary {
  totalEntries: number;
  sizeInBytes: number;
  oldestEntry?: Date;
  newestEntry?: Date;
  typeDistribution: Record<MemoryEntry['type'], number>;
  topKeywords: string[];
}

export class MemoryManager {
  private workingMemory: WorkingMemory;
  private config: MemoryConfig;
  private keywordIndex: Map<string, Set<string>>; // keyword -> entry IDs
  private referenceGraph: Map<string, Set<string>>; // entry ID -> referenced IDs

  constructor(sessionId: string, config: Partial<MemoryConfig> = {}) {
    this.config = {
      maxEntries: config.maxEntries || 1000,
      ttlSeconds: config.ttlSeconds || 3600, // 1 hour default
      summarizationThreshold: config.summarizationThreshold || 0.8, // 80% full
      maxSizeInBytes: config.maxSizeInBytes || 10 * 1024 * 1024, // 10MB
      relevanceDecayRate: config.relevanceDecayRate || 0.95, // 5% decay per access
    };

    this.workingMemory = {
      id: crypto.randomUUID(),
      agentSessionId: sessionId,
      entries: [],
      created: new Date(),
      lastAccessed: new Date(),
      sizeInBytes: 0,
    };

    this.keywordIndex = new Map();
    this.referenceGraph = new Map();
  }

  // Add a new memory entry
  addEntry(
    type: MemoryEntry['type'],
    content: string,
    metadata?: Record<string, any>,
    references?: string[]
  ): MemoryEntry {
    // Check memory limits before adding
    this.enforceMemoryLimits();

    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      type,
      content,
      metadata: metadata || {},
      timestamp: new Date(),
      relevanceScore: 1.0,
      ttl: this.config.ttlSeconds,
      references: references || [],
    };

    // Update size estimate
    const entrySize = this.estimateEntrySize(entry);
    this.workingMemory.sizeInBytes = (this.workingMemory.sizeInBytes || 0) + entrySize;

    // Add to working memory
    this.workingMemory.entries.push(entry);
    this.workingMemory.lastAccessed = new Date();

    // Update indexes
    this.indexEntry(entry);

    // Update reference graph
    if (references && references.length > 0) {
      this.updateReferenceGraph(entry.id, references);
    }

    return entry;
  }

  // Retrieve memories based on search criteria
  searchMemories(criteria: MemorySearchCriteria): MemoryEntry[] {
    let results = [...this.workingMemory.entries];

    // Filter by type
    if (criteria.types && criteria.types.length > 0) {
      results = results.filter((e) => criteria.types!.includes(e.type));
    }

    // Filter by relevance score
    if (criteria.minRelevanceScore !== undefined) {
      results = results.filter((e) => e.relevanceScore >= criteria.minRelevanceScore!);
    }

    // Filter by time range
    if (criteria.startTime) {
      results = results.filter((e) => e.timestamp >= criteria.startTime!);
    }
    if (criteria.endTime) {
      results = results.filter((e) => e.timestamp <= criteria.endTime!);
    }

    // Filter by keywords
    if (criteria.keywords && criteria.keywords.length > 0) {
      results = results.filter((entry) => {
        const entryContent = entry.content.toLowerCase();
        return criteria.keywords!.some((keyword) => entryContent.includes(keyword.toLowerCase()));
      });
    }

    // Sort by relevance and timestamp
    results.sort((a, b) => {
      const relevanceDiff = b.relevanceScore - a.relevanceScore;
      if (Math.abs(relevanceDiff) > 0.01) {
        return relevanceDiff;
      }
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    // Apply limit
    if (criteria.limit) {
      results = results.slice(0, criteria.limit);
    }

    // Update relevance scores for accessed entries
    results.forEach((entry) => {
      entry.relevanceScore *= this.config.relevanceDecayRate;
    });

    return results;
  }

  // Get memory context for the agent
  getContext(maxTokens: number = 2000): string {
    // Get most relevant recent entries
    const relevantEntries = this.searchMemories({
      minRelevanceScore: 0.5,
      limit: 20,
    });

    // Build context string
    let context = '';
    const contextParts: string[] = [];

    for (const entry of relevantEntries) {
      const entryText = this.formatEntryForContext(entry);
      if (context.length + entryText.length < maxTokens) {
        contextParts.push(entryText);
        context += entryText + '\n';
      } else {
        break;
      }
    }

    // Add summary if available
    if (this.workingMemory.summary) {
      const summaryText = `Summary: ${this.workingMemory.summary}\n`;
      if (context.length + summaryText.length < maxTokens) {
        context = summaryText + context;
      }
    }

    return context.trim();
  }

  // Summarize memory when threshold is reached
  async summarizeMemory(): Promise<string> {
    const memoryUtilization = this.workingMemory.entries.length / this.config.maxEntries;

    if (memoryUtilization < this.config.summarizationThreshold) {
      return this.workingMemory.summary || '';
    }

    // Group entries by type and time
    const groupedEntries = this.groupEntriesByTypeAndTime();

    // Create summary
    const summary = this.createSummaryFromGroups(groupedEntries);

    // Store summary
    this.workingMemory.summary = summary;

    // Remove old, low-relevance entries
    this.pruneOldEntries();

    return summary;
  }

  // Calculate relevance score based on various factors
  calculateRelevanceScore(entry: MemoryEntry, context?: string): number {
    let score = entry.relevanceScore;

    // Time decay
    const ageInSeconds = (Date.now() - entry.timestamp.getTime()) / 1000;
    const timeDecay = Math.exp(-ageInSeconds / this.config.ttlSeconds);
    score *= timeDecay;

    // Type importance
    const typeWeights: Record<MemoryEntry['type'], number> = {
      decision: 1.0,
      result: 0.9,
      error: 0.95,
      observation: 0.8,
    };
    score *= typeWeights[entry.type] || 0.8;

    // Context relevance
    if (context) {
      const contextRelevance = this.calculateContextRelevance(entry.content, context);
      score *= contextRelevance;
    }

    // Reference importance (entries referenced by many others are more important)
    const referenceCount = this.getReferenceCount(entry.id);
    score *= 1 + referenceCount * 0.1;

    return Math.min(1.0, Math.max(0.0, score));
  }

  // Get memory statistics
  getStatistics(): MemorySummary {
    const typeDistribution: Record<MemoryEntry['type'], number> = {
      observation: 0,
      decision: 0,
      result: 0,
      error: 0,
    };

    this.workingMemory.entries.forEach((entry) => {
      typeDistribution[entry.type]++;
    });

    const timestamps = this.workingMemory.entries.map((e) => e.timestamp);
    const oldestEntry = timestamps.length > 0 ? new Date(Math.min(...timestamps.map((t) => t.getTime()))) : undefined;
    const newestEntry = timestamps.length > 0 ? new Date(Math.max(...timestamps.map((t) => t.getTime()))) : undefined;

    // Get top keywords
    const keywordCounts = new Map<string, number>();
    this.keywordIndex.forEach((ids, keyword) => {
      keywordCounts.set(keyword, ids.size);
    });
    const topKeywords = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword]) => keyword);

    return {
      totalEntries: this.workingMemory.entries.length,
      sizeInBytes: this.workingMemory.sizeInBytes || 0,
      oldestEntry,
      newestEntry,
      typeDistribution,
      topKeywords,
    };
  }

  // Get related memories based on references and content similarity
  getRelatedMemories(entryId: string, limit: number = 5): MemoryEntry[] {
    const entry = this.workingMemory.entries.find((e) => e.id === entryId);
    if (!entry) {
      return [];
    }

    const related = new Map<string, number>(); // entry ID -> relevance score

    // Direct references
    if (entry.references) {
      entry.references.forEach((refId) => {
        related.set(refId, 1.0);
      });
    }

    // Entries that reference this one
    this.referenceGraph.forEach((refs, id) => {
      if (refs.has(entryId)) {
        const currentScore = related.get(id) || 0;
        related.set(id, Math.max(currentScore, 0.9));
      }
    });

    // Similar content (based on shared keywords)
    const entryKeywords = this.extractKeywords(entry.content);
    this.workingMemory.entries.forEach((otherEntry) => {
      if (otherEntry.id === entryId) return;

      const otherKeywords = this.extractKeywords(otherEntry.content);
      const similarity = this.calculateKeywordSimilarity(entryKeywords, otherKeywords);

      if (similarity > 0.3) {
        const currentScore = related.get(otherEntry.id) || 0;
        related.set(otherEntry.id, Math.max(currentScore, similarity * 0.8));
      }
    });

    // Get entries and sort by relevance
    const relatedEntries = Array.from(related.entries())
      .map(([id, score]) => ({
        entry: this.workingMemory.entries.find((e) => e.id === id)!,
        score,
      }))
      .filter((item) => item.entry)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.entry);

    return relatedEntries;
  }

  // Export memory for persistence
  exportMemory(): WorkingMemory {
    return {
      ...this.workingMemory,
      entries: [...this.workingMemory.entries],
    };
  }

  // Import memory from persistence
  importMemory(memory: WorkingMemory): void {
    this.workingMemory = {
      ...memory,
      entries: [...memory.entries],
    };

    // Rebuild indexes
    this.rebuildIndexes();
  }

  // Private helper methods

  private enforceMemoryLimits(): void {
    // Remove expired entries
    const now = Date.now();
    this.workingMemory.entries = this.workingMemory.entries.filter((entry) => {
      if (entry.ttl) {
        const expiryTime = entry.timestamp.getTime() + entry.ttl * 1000;
        return expiryTime > now;
      }
      return true;
    });

    // Check size limit
    if (this.workingMemory.sizeInBytes && this.workingMemory.sizeInBytes > this.config.maxSizeInBytes) {
      this.pruneBySize();
    }

    // Check entry count limit
    if (this.workingMemory.entries.length >= this.config.maxEntries) {
      this.pruneByCount();
    }
  }

  private pruneBySize(): void {
    // Remove entries until under size limit
    const sortedEntries = [...this.workingMemory.entries].sort(
      (a, b) => this.calculateRelevanceScore(a) - this.calculateRelevanceScore(b)
    );

    let currentSize = this.workingMemory.sizeInBytes || 0;
    const targetSize = this.config.maxSizeInBytes * 0.8; // Keep 80% after pruning

    while (currentSize > targetSize && sortedEntries.length > 0) {
      const entry = sortedEntries.shift()!;
      const entrySize = this.estimateEntrySize(entry);
      currentSize -= entrySize;

      // Remove from main array
      const index = this.workingMemory.entries.findIndex((e) => e.id === entry.id);
      if (index > -1) {
        this.workingMemory.entries.splice(index, 1);
        this.removeFromIndexes(entry);
      }
    }

    this.workingMemory.sizeInBytes = currentSize;
  }

  private pruneByCount(): void {
    // Keep most relevant entries
    const targetCount = Math.floor(this.config.maxEntries * 0.8);
    const sortedEntries = [...this.workingMemory.entries].sort(
      (a, b) => this.calculateRelevanceScore(b) - this.calculateRelevanceScore(a)
    );

    const toKeep = sortedEntries.slice(0, targetCount);
    const toRemove = sortedEntries.slice(targetCount);

    // Remove low relevance entries
    toRemove.forEach((entry) => {
      this.removeFromIndexes(entry);
    });

    this.workingMemory.entries = toKeep;
  }

  private pruneOldEntries(): void {
    const threshold = 0.3; // Remove entries with relevance < 0.3
    const toRemove = this.workingMemory.entries.filter((entry) => this.calculateRelevanceScore(entry) < threshold);

    toRemove.forEach((entry) => {
      const index = this.workingMemory.entries.indexOf(entry);
      if (index > -1) {
        this.workingMemory.entries.splice(index, 1);
        this.removeFromIndexes(entry);
      }
    });
  }

  private estimateEntrySize(entry: MemoryEntry): number {
    // Rough estimate of memory size in bytes
    const jsonString = JSON.stringify(entry);
    return jsonString.length * 2; // UTF-16 encoding
  }

  private indexEntry(entry: MemoryEntry): void {
    const keywords = this.extractKeywords(entry.content);
    keywords.forEach((keyword) => {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, new Set());
      }
      this.keywordIndex.get(keyword)!.add(entry.id);
    });
  }

  private removeFromIndexes(entry: MemoryEntry): void {
    // Remove from keyword index
    const keywords = this.extractKeywords(entry.content);
    keywords.forEach((keyword) => {
      const ids = this.keywordIndex.get(keyword);
      if (ids) {
        ids.delete(entry.id);
        if (ids.size === 0) {
          this.keywordIndex.delete(keyword);
        }
      }
    });

    // Remove from reference graph
    this.referenceGraph.delete(entry.id);
    this.referenceGraph.forEach((refs) => {
      refs.delete(entry.id);
    });
  }

  private rebuildIndexes(): void {
    this.keywordIndex.clear();
    this.referenceGraph.clear();

    this.workingMemory.entries.forEach((entry) => {
      this.indexEntry(entry);
      if (entry.references && entry.references.length > 0) {
        this.updateReferenceGraph(entry.id, entry.references);
      }
    });
  }

  private extractKeywords(content: string): string[] {
    // Simple keyword extraction
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !this.isStopWord(word));

    return Array.from(new Set(words));
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the',
      'and',
      'for',
      'with',
      'from',
      'this',
      'that',
      'what',
      'when',
      'where',
      'which',
      'while',
      'about',
      'after',
      'before',
      'have',
      'been',
      'will',
      'would',
      'could',
      'should',
      'might',
    ]);
    return stopWords.has(word);
  }

  private calculateContextRelevance(content: string, context: string): number {
    const contentKeywords = this.extractKeywords(content);
    const contextKeywords = this.extractKeywords(context);
    return this.calculateKeywordSimilarity(contentKeywords, contextKeywords);
  }

  private calculateKeywordSimilarity(keywords1: string[], keywords2: string[]): number {
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private updateReferenceGraph(entryId: string, references: string[]): void {
    if (!this.referenceGraph.has(entryId)) {
      this.referenceGraph.set(entryId, new Set());
    }
    references.forEach((ref) => {
      this.referenceGraph.get(entryId)!.add(ref);
    });
  }

  private getReferenceCount(entryId: string): number {
    let count = 0;
    this.referenceGraph.forEach((refs) => {
      if (refs.has(entryId)) {
        count++;
      }
    });
    return count;
  }

  private formatEntryForContext(entry: MemoryEntry): string {
    return `[${entry.type}] ${entry.content}`;
  }

  private groupEntriesByTypeAndTime(): Map<string, MemoryEntry[]> {
    const groups = new Map<string, MemoryEntry[]>();
    const timeWindow = 300000; // 5 minutes

    this.workingMemory.entries.forEach((entry) => {
      const timeSlot = Math.floor(entry.timestamp.getTime() / timeWindow);
      const key = `${entry.type}_${timeSlot}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(entry);
    });

    return groups;
  }

  private createSummaryFromGroups(groups: Map<string, MemoryEntry[]>): string {
    const summaryParts: string[] = [];

    groups.forEach((entries, key) => {
      if (entries.length === 0) return;

      const [type] = key.split('_');
      const timestamp = entries[0].timestamp.toISOString().split('T')[0];

      const summary = this.summarizeEntries(entries);
      summaryParts.push(`${timestamp} [${type}]: ${summary}`);
    });

    return summaryParts.join('\n');
  }

  private summarizeEntries(entries: MemoryEntry[]): string {
    // Simple summarization - in a real implementation, this could use an LLM
    if (entries.length === 1) {
      return entries[0].content;
    }

    // Find common themes
    const allKeywords = entries.flatMap((e) => this.extractKeywords(e.content));
    const keywordCounts = new Map<string, number>();

    allKeywords.forEach((keyword) => {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
    });

    // Get most common keywords
    const topKeywords = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([keyword]) => keyword);

    return `${entries.length} entries about: ${topKeywords.join(', ')}`;
  }
}
