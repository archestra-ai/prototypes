import React from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { formatToolName } from '@/lib/format-tool-name';
import type { ToolWithMCPServerName } from '@/types';

import { ToolServerIcon } from '../ToolServerIcon';
import ToolStatusIcon from '../ToolStatusIcon';

interface ToolHoverCardProps extends React.PropsWithChildren {
  tool: ToolWithMCPServerName;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  showInstructions?: boolean;
  instructionText?: string;
}

export function ToolHoverCard({
  tool: { serverName, name, enabled, description },
  children,
  side = 'right',
  align = 'start',
  showInstructions = false,
  instructionText,
}: ToolHoverCardProps) {
  return (
    <HoverCard openDelay={100} closeDelay={0}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-80" side={side} align={align}>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <ToolServerIcon toolServerName={serverName} />
            <div>
              <h4 className="font-semibold">{formatToolName(name)}</h4>
              <p className="text-xs text-muted-foreground">From {serverName}</p>
            </div>
          </div>

          {description && (
            <div>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t">
            <ToolStatusIcon enabled={enabled} />
            <span className="text-xs text-muted-foreground">{!enabled ? 'Disabled' : 'Available'}</span>
          </div>

          {showInstructions && instructionText && (
            <div className="text-xs text-muted-foreground pt-2 border-t">{instructionText}</div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
