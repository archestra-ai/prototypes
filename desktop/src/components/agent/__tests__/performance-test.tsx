import { useEffect, useState } from 'react';

import { usePerformanceMonitor } from '@/components/agent/performance-optimizations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAgentStore } from '@/stores/agent-store';
import { useChatStore } from '@/stores/chat-store';
import { ChatMessage } from '@/types';

/**
 * Performance test component for testing the optimized components with large message histories
 */
export function PerformanceTestPanel() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [renderTime, setRenderTime] = useState<number>(0);
  const [fps, setFps] = useState<number>(60);

  const chatStore = useChatStore();
  const { setAgentMode, addReasoningEntry, updateProgress } = useAgentStore();

  // Monitor component performance
  usePerformanceMonitor('PerformanceTestPanel');

  // FPS monitoring
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime >= lastTime + 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }
      
      animationId = requestAnimationFrame(measureFPS);
    };

    measureFPS();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, []);

  // Generate large message history for testing
  const generateLargeHistory = async (count: number) => {
    setIsGenerating(true);
    const startTime = performance.now();

    // Set agent to executing mode
    setAgentMode('executing');

    for (let i = 0; i < count; i++) {
      // Add user message
      const userMessage: ChatMessage = {
        id: `user-${i}`,
        role: 'user',
        content: `Test message ${i}: This is a longer user message to simulate real conversation content. The user is asking about implementation details of a complex system that requires detailed explanation.`,
        timestamp: new Date(),
      };
      
      // Directly update chat history
      chatStore.chatHistory.push(userMessage);

      // Add assistant message with various content types
      const assistantMessage: any = {
        id: `assistant-${i}`,
        role: 'assistant',
        content: `Response ${i}: This is a detailed assistant response with multiple paragraphs of content.

The assistant is providing comprehensive information about the topic, including:
- Technical details and implementation notes
- Code examples and best practices
- Performance considerations
- Security implications

This helps test the rendering performance with substantial content.`,
        timestamp: new Date(),
        isStreaming: false,
        isToolExecuting: false,
      };

      // Add tool calls every 5th message
      if (i % 5 === 0) {
        assistantMessage.toolCalls = [
          {
            id: `tool-${i}-1`,
            toolName: 'test_server_search_tool',
            arguments: { query: `test query ${i}` },
            status: 'completed',
            result: { data: `Tool result for message ${i}` },
          },
          {
            id: `tool-${i}-2`,
            toolName: 'test_server_analyze_tool',
            arguments: { data: `test data ${i}` },
            status: 'completed',
            result: { analysis: `Analysis result for message ${i}` },
          },
        ];
      }

      // Add reasoning every 3rd message
      if (i % 3 === 0) {
        assistantMessage.agentMetadata = {
          reasoningText: {
            id: `reasoning-${i}`,
            type: 'planning',
            content: `Planning step ${i}: The agent is analyzing the request and determining the best approach. This involves considering multiple factors including performance, accuracy, and user requirements.`,
            timestamp: new Date(),
            confidence: 0.85 + Math.random() * 0.15,
            alternatives: [
              {
                id: `alt-${i}-1`,
                description: `Alternative approach ${i}-1`,
                pros: ['Faster execution', 'Lower resource usage'],
                cons: ['Less accurate', 'More complex'],
                feasibility: 0.7,
              },
            ],
          },
        };

        // Also add to reasoning store
        addReasoningEntry({
          id: `reasoning-${i}`,
          type: 'planning',
          content: assistantMessage.agentMetadata.reasoningText.content,
          timestamp: new Date(),
          confidence: assistantMessage.agentMetadata.reasoningText.confidence,
          alternatives: assistantMessage.agentMetadata.reasoningText.alternatives,
        });
      }

      // Directly update chat history
      chatStore.chatHistory.push(assistantMessage);

      // Update task progress
      if (i % 10 === 0) {
        updateProgress({
          completed: i,
          total: count,
          currentStep: `Processing message batch ${Math.floor(i / 10) + 1}`,
          percentComplete: Math.round((i / count) * 100),
        });
      }

      // Small delay to prevent blocking
      if (i % 50 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    // Final task progress
    updateProgress({
      completed: count,
      total: count,
      currentStep: 'All messages generated',
      percentComplete: 100,
    });

    const endTime = performance.now();
    setRenderTime(endTime - startTime);
    setMessageCount(count * 2); // User + Assistant messages
    setIsGenerating(false);
    setAgentMode('completed');
  };

  // Clear all messages
  const clearHistory = () => {
    useChatStore.getState().clearChatHistory();
    useAgentStore.getState().clearAgent();
    setMessageCount(0);
    setRenderTime(0);
    setAgentMode('idle');
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Performance Testing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Current Stats</div>
            <div className="space-y-1 text-sm">
              <div>Messages: {messageCount}</div>
              <div>FPS: {fps}</div>
              <div>Last Render: {renderTime.toFixed(2)}ms</div>
              <div>Avg per msg: {messageCount > 0 ? (renderTime / messageCount).toFixed(2) : '0'}ms</div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm font-medium">Performance Metrics</div>
            <div className="space-y-1 text-sm">
              <div className={cn('flex items-center gap-1', fps >= 50 ? 'text-green-600' : fps >= 30 ? 'text-yellow-600' : 'text-red-600')}>
                <div className="h-2 w-2 rounded-full bg-current" />
                {fps >= 50 ? 'Smooth' : fps >= 30 ? 'Acceptable' : 'Poor'} Performance
              </div>
              <div>Memory: {typeof performance !== 'undefined' && 'memory' in performance ? `${Math.round((performance as any).memory.usedJSHeapSize / 1048576)}MB` : 'N/A'}</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => generateLargeHistory(100)}
            disabled={isGenerating}
          >
            Generate 100 Messages
          </Button>
          <Button
            size="sm"
            onClick={() => generateLargeHistory(500)}
            disabled={isGenerating}
          >
            Generate 500 Messages
          </Button>
          <Button
            size="sm"
            onClick={() => generateLargeHistory(1000)}
            disabled={isGenerating}
          >
            Generate 1000 Messages
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={clearHistory}
            disabled={isGenerating}
          >
            Clear All
          </Button>
        </div>

        {isGenerating && (
          <div className="text-sm text-muted-foreground animate-pulse">
            Generating messages...
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p>Performance optimizations applied:</p>
          <ul className="list-disc list-inside mt-1">
            <li>React.memo on all major components</li>
            <li>Memoized render functions with useCallback</li>
            <li>Throttled plan updates</li>
            <li>Optimized message part rendering</li>
            <li>Custom comparison functions for memoization</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// Import cn utility
import { cn } from '@/lib/utils';