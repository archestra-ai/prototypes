import { useEffect, useState } from 'react';

import { getAvailableTools } from '@ui/lib/clients/archestra/api/gen';
import type { AvailableTool } from '@ui/lib/clients/archestra/api/gen';

interface UseAvailableToolsOptions {
  refetchInterval?: number;
}

export function useAvailableTools({ refetchInterval = 5000 }: UseAvailableToolsOptions = {}) {
  const [tools, setTools] = useState<AvailableTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchTools = async () => {
      try {
        const response = await getAvailableTools();
        setTools((response.data as AvailableTool[]) || []);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch tools:', err);
        setError(err as Error);
        setTools([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTools();

    const interval = setInterval(fetchTools, refetchInterval);
    return () => clearInterval(interval);
  }, [refetchInterval]);

  // Group tools by server
  const toolsByServer = tools.reduce((acc: Record<string, AvailableTool[]>, tool: AvailableTool) => {
    const serverName = tool.mcpServerName || 'Unknown';
    if (!acc[serverName]) {
      acc[serverName] = [];
    }
    acc[serverName].push(tool);
    return acc;
  }, {});

  // Create a map for quick tool lookups
  const toolsMap = tools.reduce(
    (acc, tool) => {
      acc[tool.id] = tool;
      return acc;
    },
    {} as Record<string, AvailableTool>
  );

  return {
    tools,
    toolsByServer,
    toolsMap,
    isLoading,
    error,
  };
}
