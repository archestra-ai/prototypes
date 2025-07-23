import React from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { formatToolName } from '@/lib/format-tool-name';
import { cn } from '@/lib/utils';

export interface ToolInfo {
  serverName: string;
  toolName: string;
  enabled?: boolean;
  description?: string;
}

interface ToolHoverCardProps {
  tool: ToolInfo;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  showInstructions?: boolean;
  instructionText?: string;
}

export function ToolHoverCard({
  tool,
  children,
  side = 'right',
  align = 'start',
  showInstructions = false,
  instructionText,
}: ToolHoverCardProps) {
  const getServerIcon = (serverName: string) => {
    switch (serverName.toLowerCase()) {
      case 'gmail':
        return (
          <div className="w-6 h-6 bg-red-500 rounded-sm flex items-center justify-center">
            <span className="text-white text-xs font-bold">M</span>
          </div>
        );
      case 'slack':
        return (
          <div className="w-6 h-6 bg-purple-500 rounded-sm flex items-center justify-center">
            <span className="text-white text-xs font-bold">#</span>
          </div>
        );
      default:
        return (
          <div className="w-6 h-6 bg-blue-500 rounded-sm flex items-center justify-center">
            <span className="text-white text-xs font-bold">{serverName.charAt(0).toUpperCase()}</span>
          </div>
        );
    }
  };

  return (
    <HoverCard openDelay={100} closeDelay={0}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-80" side={side} align={align}>
        <div className="space-y-3">
          {/* Tool Header */}
          <div className="flex items-center gap-3">
            {getServerIcon(tool.serverName)}
            <div>
              <h4 className="font-semibold">{formatToolName(tool.toolName)}</h4>
              <p className="text-xs text-muted-foreground">From {tool.serverName}</p>
            </div>
          </div>

          {/* Description */}
          {tool.description && (
            <div>
              <p className="text-sm text-muted-foreground">{tool.description}</p>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <div className={cn('w-2 h-2 rounded-full', tool.enabled === false ? 'bg-red-500' : 'bg-green-500')} />
            <span className="text-xs text-muted-foreground">{tool.enabled === false ? 'Disabled' : 'Available'}</span>
          </div>

          {/* Instructions */}
          {showInstructions && instructionText && (
            <div className="text-xs text-muted-foreground pt-2 border-t">{instructionText}</div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
