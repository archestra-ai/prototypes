import React from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@ui/components/ui/hover-card';
import { formatToolName } from '@ui/lib/utils/tools';
import { useToolsStore } from '@ui/stores';
import type { Tool } from '@ui/types';

import { ToolServerIcon } from '../ToolServerIcon';
import ToolStatusIcon from '../ToolStatusIcon';

interface ToolHoverCardProps extends React.PropsWithChildren {
  tool: Tool;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  showInstructions?: boolean;
  instructionText?: string;
}

export function ToolHoverCard({
  tool: { mcpServerName, name, description, id },
  children,
  side = 'right',
  align = 'start',
  showInstructions = false,
  instructionText,
}: ToolHoverCardProps) {
  const { selectedToolIds } = useToolsStore();
  const isSelected = selectedToolIds.has(id);

  return (
    <HoverCard openDelay={100} closeDelay={0}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-80" side={side} align={align}>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <ToolServerIcon toolServerName={mcpServerName} />
            <div>
              <h4 className="font-semibold">{formatToolName(name)}</h4>
              <p className="text-xs text-muted-foreground">From {mcpServerName}</p>
            </div>
          </div>

          {description && (
            <div>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t">
            <ToolStatusIcon enabled={isSelected} />
            <span className="text-xs text-muted-foreground">{!isSelected ? 'Disabled' : 'Available'}</span>
          </div>

          {showInstructions && instructionText && (
            <div className="text-xs text-muted-foreground pt-2 border-t">{instructionText}</div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
