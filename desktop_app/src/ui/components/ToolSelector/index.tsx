import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getAvailableTools } from '@ui/lib/clients/archestra/api/gen';

import { Checkbox } from '../ui/checkbox';
import { ScrollArea } from '../ui/scroll-area';

interface ToolSelectorProps {
  onToolsChange: (tools: string[]) => void;
  selectedTools?: string[];
}

export const ToolSelector = ({ onToolsChange, selectedTools: initialSelectedTools = [] }: ToolSelectorProps) => {
  const { data: availableTools = [], isLoading } = useQuery({
    queryKey: ['availableTools'],
    queryFn: async () => {
      const response = await getAvailableTools();
      return response.data || [];
    },
    refetchInterval: 5000, // Poll for updates as servers connect/disconnect
  });

  const [selectedTools, setSelectedTools] = useState<string[]>(initialSelectedTools);

  const handleToggle = (toolId: string, checked: boolean) => {
    const newSelection = checked ? [...selectedTools, toolId] : selectedTools.filter((id) => id !== toolId);

    setSelectedTools(newSelection);
    onToolsChange(newSelection);
  };

  // Group tools by server
  const toolsByServer = availableTools.reduce(
    (acc, tool) => {
      const serverName = tool.mcpServerName || 'Unknown';
      if (!acc[serverName]) {
        acc[serverName] = [];
      }
      acc[serverName].push(tool);
      return acc;
    },
    {} as Record<string, typeof availableTools>
  );

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading available tools...</div>;
  }

  if (availableTools.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No tools available. Install and start MCP servers to see tools.
      </div>
    );
  }

  return (
    <ScrollArea className="h-[300px] w-full rounded-md border p-4">
      <div className="space-y-4">
        {Object.entries(toolsByServer).map(([serverName, tools]) => (
          <div key={serverName} className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">{serverName}</h4>
            <div className="space-y-2">
              {tools.map((tool) => (
                <div key={tool.id} className="flex items-start space-x-2">
                  <Checkbox
                    id={tool.id}
                    checked={selectedTools.includes(tool.id)}
                    onCheckedChange={(checked) => handleToggle(tool.id, checked as boolean)}
                  />
                  <div className="flex-1">
                    <label
                      htmlFor={tool.id}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {tool.name}
                    </label>
                    {tool.description && <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};
