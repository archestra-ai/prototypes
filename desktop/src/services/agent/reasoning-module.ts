import { AgentContext, Alternative, ReasoningEntry, TaskStep } from '../../types/agent';

export interface ReasoningConfig {
  maxAlternatives: number;
  minConfidenceThreshold: number;
  verbosityLevel: 'verbose' | 'concise' | 'hidden';
  enableExplanations: boolean;
}

export interface DecisionCriteria {
  feasibility: number;
  efficiency: number;
  risk: number;
  userPreference: number;
  resourceUsage: number;
}

export interface ReasoningContext {
  objective: string;
  currentState: string;
  availableResources: string[];
  constraints: string[];
  previousDecisions: ReasoningEntry[];
}

export class ReasoningModule {
  private config: ReasoningConfig;
  private reasoningHistory: ReasoningEntry[];

  constructor(config: Partial<ReasoningConfig> = {}) {
    this.config = {
      maxAlternatives: config.maxAlternatives || 5,
      minConfidenceThreshold: config.minConfidenceThreshold || 0.6,
      verbosityLevel: config.verbosityLevel || 'verbose',
      enableExplanations: config.enableExplanations !== false,
    };
    this.reasoningHistory = [];
  }

  createPlanningReasoning(objective: string, steps: TaskStep[], alternatives?: Alternative[]): ReasoningEntry {
    const content = this.formatPlanningReasoning(objective, steps);
    const confidence = this.calculatePlanConfidence(steps);

    const entry: ReasoningEntry = {
      id: crypto.randomUUID(),
      type: 'planning',
      content,
      alternatives,
      confidence,
      timestamp: new Date(),
      context: {
        objective,
        stepCount: steps.length,
        estimatedDuration: steps.reduce((sum, step) => sum + step.estimatedDuration, 0),
      },
    };

    this.reasoningHistory.push(entry);
    return entry;
  }

  createDecisionReasoning(
    decision: string,
    alternatives: Alternative[],
    selectedOptionId: string,
    context: ReasoningContext
  ): ReasoningEntry {
    const evaluatedAlternatives = this.evaluateAlternatives(alternatives, context);
    const content = this.formatDecisionReasoning(decision, evaluatedAlternatives, selectedOptionId);
    const confidence = this.calculateDecisionConfidence(evaluatedAlternatives, selectedOptionId);

    const entry: ReasoningEntry = {
      id: crypto.randomUUID(),
      type: 'decision',
      content,
      alternatives: evaluatedAlternatives,
      selectedOption: selectedOptionId,
      confidence,
      timestamp: new Date(),
      context: {
        decision,
        alternativeCount: alternatives.length,
        criteria: this.getDecisionCriteria(context),
      },
    };

    this.reasoningHistory.push(entry);
    return entry;
  }

  createEvaluationReasoning(evaluation: string, metrics: Record<string, any>, confidence: number): ReasoningEntry {
    const content = this.formatEvaluationReasoning(evaluation, metrics);

    const entry: ReasoningEntry = {
      id: crypto.randomUUID(),
      type: 'evaluation',
      content,
      confidence,
      timestamp: new Date(),
      context: {
        evaluation,
        metrics,
      },
    };

    this.reasoningHistory.push(entry);
    return entry;
  }

  createAdaptationReasoning(
    reason: string,
    originalPlan: string,
    adaptedPlan: string,
    triggerEvent: string
  ): ReasoningEntry {
    const content = this.formatAdaptationReasoning(reason, originalPlan, adaptedPlan, triggerEvent);
    const confidence = 0.8; // Adaptations typically have good confidence

    const entry: ReasoningEntry = {
      id: crypto.randomUUID(),
      type: 'adaptation',
      content,
      confidence,
      timestamp: new Date(),
      context: {
        reason,
        triggerEvent,
        originalPlan,
        adaptedPlan,
      },
    };

    this.reasoningHistory.push(entry);
    return entry;
  }

  generateAlternatives(decision: string, context: AgentContext, maxAlternatives?: number): Alternative[] {
    const alternatives: Alternative[] = [];
    const limit = maxAlternatives || this.config.maxAlternatives;

    // This is a simplified implementation - in a real system, this would use
    // more sophisticated logic or even LLM calls to generate alternatives

    // Example: Generate tool selection alternatives
    if (decision.includes('tool selection')) {
      const availableTools = context.availableTools || [];

      availableTools.slice(0, limit).forEach((tool) => {
        alternatives.push({
          id: crypto.randomUUID(),
          description: `Use ${tool.name} from ${tool.serverName}`,
          pros: [
            `Available and ready to use`,
            tool.capabilities.join(', '),
            `Average latency: ${tool.performance.averageLatency}ms`,
          ],
          cons: [
            tool.requiresPermission ? 'Requires user permission' : '',
            tool.cost ? `Has associated cost: ${tool.cost}` : '',
          ].filter(Boolean),
          feasibility: tool.performance.successRate,
          estimatedDuration: tool.performance.averageLatency,
        });
      });
    }

    if (alternatives.length === 0) {
      alternatives.push(
        {
          id: crypto.randomUUID(),
          description: 'Direct approach with minimal steps',
          pros: ['Fast execution', 'Simple implementation', 'Low resource usage'],
          cons: ['May miss edge cases', 'Less flexible'],
          feasibility: 0.9,
          estimatedDuration: 1000,
        },
        {
          id: crypto.randomUUID(),
          description: 'Comprehensive approach with validation',
          pros: ['Handles edge cases', 'More reliable', 'Better error handling'],
          cons: ['Slower execution', 'More complex', 'Higher resource usage'],
          feasibility: 0.8,
          estimatedDuration: 3000,
        }
      );
    }

    return alternatives;
  }

  private evaluateAlternatives(alternatives: Alternative[], context: ReasoningContext): Alternative[] {
    return alternatives.map((alt) => {
      const criteria = this.calculateCriteria(alt, context);
      const overallScore = this.calculateOverallScore(criteria);

      return {
        ...alt,
        feasibility: overallScore,
        metadata: {
          criteria,
          evaluatedAt: new Date(),
        },
      };
    });
  }

  private calculatePlanConfidence(steps: TaskStep[]): number {
    if (steps.length === 0) return 0;

    let confidence = 1.0;

    confidence *= Math.pow(0.95, steps.length);

    const failedSteps = steps.filter((s) => s.status === 'failed').length;
    confidence *= Math.pow(0.7, failedSteps);

    const hasComplexDependencies = steps.some((s) => (s.dependencies?.length || 0) > 2);
    if (hasComplexDependencies) {
      confidence *= 0.9;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private calculateDecisionConfidence(alternatives: Alternative[], selectedId: string): number {
    const selected = alternatives.find((a) => a.id === selectedId);
    if (!selected) return 0.5;

    // Base confidence on feasibility of selected option
    let confidence = selected.feasibility;

    // Consider the gap between best and second-best option
    const sortedAlts = alternatives.sort((a, b) => b.feasibility - a.feasibility);
    if (sortedAlts.length > 1) {
      const gap = sortedAlts[0].feasibility - sortedAlts[1].feasibility;
      confidence += gap * 0.2; // Larger gap = more confidence
    }

    // Consider number of pros vs cons
    const prosCount = selected.pros.length;
    const consCount = selected.cons.filter((c) => c !== '').length;
    const prosConsRatio = prosCount / (prosCount + consCount);
    confidence *= 0.5 + prosConsRatio * 0.5;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  // Format reasoning for UI display
  formatReasoningForUI(entry: ReasoningEntry, mode: 'verbose' | 'concise' | 'hidden'): string {
    if (mode === 'hidden') {
      return '';
    }

    if (mode === 'concise') {
      return this.formatConciseReasoning(entry);
    }

    return this.formatVerboseReasoning(entry);
  }

  // Format planning reasoning
  private formatPlanningReasoning(objective: string, steps: TaskStep[]): string {
    const stepDescriptions = steps
      .map((step, index) => `${index + 1}. ${step.description} (${step.estimatedDuration}ms)`)
      .join('\n');

    return `Planning to achieve: ${objective}\n\nProposed steps:\n${stepDescriptions}`;
  }

  // Format decision reasoning
  private formatDecisionReasoning(decision: string, alternatives: Alternative[], selectedId: string): string {
    const selected = alternatives.find((a) => a.id === selectedId);
    if (!selected) {
      return `Decision: ${decision}\nNo alternative selected.`;
    }

    const alternativesList = alternatives
      .map((alt) => {
        const marker = alt.id === selectedId ? '→' : ' ';
        return `${marker} ${alt.description} (feasibility: ${(alt.feasibility * 100).toFixed(0)}%)`;
      })
      .join('\n');

    return `Decision: ${decision}\n\nAlternatives considered:\n${alternativesList}\n\nSelected: ${selected.description}\nReason: ${this.explainSelection(selected, alternatives)}`;
  }

  // Format evaluation reasoning
  private formatEvaluationReasoning(evaluation: string, metrics: Record<string, any>): string {
    const metricsText = Object.entries(metrics)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    return `Evaluation: ${evaluation}\n\nMetrics:\n${metricsText}`;
  }

  // Format adaptation reasoning
  private formatAdaptationReasoning(
    reason: string,
    originalPlan: string,
    adaptedPlan: string,
    triggerEvent: string
  ): string {
    return `Adapting plan due to: ${triggerEvent}\n\nReason: ${reason}\n\nOriginal: ${originalPlan}\n\nAdapted: ${adaptedPlan}`;
  }

  // Format concise reasoning
  private formatConciseReasoning(entry: ReasoningEntry): string {
    switch (entry.type) {
      case 'planning':
        return `Planning: ${entry.context?.objective || 'task execution'}`;
      case 'decision':
        return `Decision: ${entry.selectedOption ? 'Selected ' + entry.alternatives?.find((a) => a.id === entry.selectedOption)?.description : entry.content.split('\n')[0]}`;
      case 'evaluation':
        return `Evaluation: ${entry.context?.evaluation || 'checking progress'}`;
      case 'adaptation':
        return `Adaptation: ${entry.context?.reason || 'adjusting approach'}`;
      default:
        return entry.content.split('\n')[0];
    }
  }

  // Format verbose reasoning
  private formatVerboseReasoning(entry: ReasoningEntry): string {
    let formatted = entry.content;

    // Add confidence indicator
    const confidencePercent = (entry.confidence * 100).toFixed(0);
    formatted += `\n\nConfidence: ${confidencePercent}%`;

    // Add alternatives if present
    if (entry.alternatives && entry.alternatives.length > 0) {
      formatted += '\n\nAlternatives Analysis:';
      entry.alternatives.forEach((alt) => {
        formatted += `\n\n${alt.description}`;
        formatted += `\n  Pros: ${alt.pros.join(', ')}`;
        formatted += `\n  Cons: ${alt.cons.filter((c) => c).join(', ') || 'None'}`;
        formatted += `\n  Feasibility: ${(alt.feasibility * 100).toFixed(0)}%`;
      });
    }

    return formatted;
  }

  // Explain why an alternative was selected
  private explainSelection(selected: Alternative, alternatives: Alternative[]): string {
    const reasons: string[] = [];

    // Check if it has highest feasibility
    const highestFeasibility = Math.max(...alternatives.map((a) => a.feasibility));
    if (selected.feasibility === highestFeasibility) {
      reasons.push('Highest feasibility score');
    }

    // Check pros/cons ratio
    const selectedRatio = selected.pros.length / (selected.cons.filter((c) => c).length || 1);
    const avgRatio =
      alternatives.reduce((sum, alt) => {
        return sum + alt.pros.length / (alt.cons.filter((c) => c).length || 1);
      }, 0) / alternatives.length;

    if (selectedRatio > avgRatio) {
      reasons.push('Best pros-to-cons ratio');
    }

    // Check duration if available
    if (selected.estimatedDuration) {
      const minDuration = Math.min(...alternatives.map((a) => a.estimatedDuration || Infinity));
      if (selected.estimatedDuration === minDuration) {
        reasons.push('Fastest execution time');
      }
    }

    return reasons.join(', ') || 'Balanced approach';
  }

  // Calculate decision criteria
  private calculateCriteria(alternative: Alternative, context: ReasoningContext): DecisionCriteria {
    return {
      feasibility: alternative.feasibility,
      efficiency: this.calculateEfficiency(alternative),
      risk: this.calculateRisk(alternative),
      userPreference: this.calculateUserPreference(alternative, context),
      resourceUsage: this.calculateResourceUsage(alternative),
    };
  }

  // Calculate overall score from criteria
  private calculateOverallScore(criteria: DecisionCriteria): number {
    // Weighted average of criteria
    const weights = {
      feasibility: 0.3,
      efficiency: 0.25,
      risk: 0.2, // Lower risk is better, so we'll invert
      userPreference: 0.15,
      resourceUsage: 0.1, // Lower is better, so we'll invert
    };

    const score =
      criteria.feasibility * weights.feasibility +
      criteria.efficiency * weights.efficiency +
      (1 - criteria.risk) * weights.risk +
      criteria.userPreference * weights.userPreference +
      (1 - criteria.resourceUsage) * weights.resourceUsage;

    return Math.max(0, Math.min(1, score));
  }

  // Helper methods for criteria calculation
  private calculateEfficiency(alternative: Alternative): number {
    // Base on estimated duration and pros count
    const durationScore = alternative.estimatedDuration ? 1 - Math.min(1, alternative.estimatedDuration / 10000) : 0.5;
    const prosScore = Math.min(1, alternative.pros.length / 5);
    return (durationScore + prosScore) / 2;
  }

  private calculateRisk(alternative: Alternative): number {
    // Base on cons count and specific risk indicators
    const consScore = Math.min(1, alternative.cons.filter((c) => c).length / 5);
    const hasPermissionRisk = alternative.cons.some((c) => c.includes('permission')) ? 0.2 : 0;
    const hasCostRisk = alternative.cons.some((c) => c.includes('cost')) ? 0.1 : 0;
    return Math.min(1, consScore + hasPermissionRisk + hasCostRisk);
  }

  private calculateUserPreference(alternative: Alternative, context: ReasoningContext): number {
    // Check if alternative aligns with previous decisions
    const previouslySelected = context.previousDecisions
      .filter((d) => d.type === 'decision' && d.selectedOption)
      .map((d) => d.alternatives?.find((a) => a.id === d.selectedOption))
      .filter(Boolean);

    // Simple similarity check
    let score = 0.5; // neutral default
    if (previouslySelected.length > 0) {
      // Check if similar alternatives were selected before
      const similarityCount = previouslySelected.filter((prev) =>
        prev!.description.includes(alternative.description.split(' ')[0])
      ).length;
      score = 0.5 + (similarityCount / previouslySelected.length) * 0.5;
    }

    return score;
  }

  private calculateResourceUsage(alternative: Alternative): number {
    // Estimate based on duration and complexity indicators
    const durationScore = alternative.estimatedDuration ? Math.min(1, alternative.estimatedDuration / 5000) : 0.5;
    const complexityScore = alternative.cons.some((c) => c.includes('complex')) ? 0.3 : 0;
    const resourceScore = alternative.cons.some((c) => c.includes('resource')) ? 0.2 : 0;
    return Math.min(1, durationScore + complexityScore + resourceScore);
  }

  // Get decision criteria for context
  private getDecisionCriteria(_context: ReasoningContext): DecisionCriteria {
    return {
      feasibility: 1.0,
      efficiency: 0.8,
      risk: 0.2,
      userPreference: 0.7,
      resourceUsage: 0.3,
    };
  }

  // Get reasoning history
  getHistory(limit?: number): ReasoningEntry[] {
    if (limit) {
      return this.reasoningHistory.slice(-limit);
    }
    return [...this.reasoningHistory];
  }

  // Clear reasoning history
  clearHistory(): void {
    this.reasoningHistory = [];
  }

  // Update configuration
  updateConfig(updates: Partial<ReasoningConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // Get current configuration
  getConfig(): ReasoningConfig {
    return { ...this.config };
  }
}
