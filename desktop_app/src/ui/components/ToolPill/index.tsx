import { XIcon } from 'lucide-react';

import { ToolHoverCard } from '@ui/components/ToolHoverCard';
import { Badge } from '@ui/components/ui/badge';
import { formatToolName } from '@ui/lib/utils/tools';
import { useMcpServersStore } from '@ui/stores/mcp-servers-store';
import type { ToolWithMcpServerInfo } from '@ui/types';

import { ToolServerIcon } from '../ToolServerIcon';
import ToolStatusIcon from '../ToolStatusIcon';

interface ToolPillProps {
  tool: ToolWithMcpServerInfo;
}

export default function ToolPill({ tool }: ToolPillProps) {
  const { server, name, enabled } = tool;
  const { removeSelectedTool } = useMcpServersStore();

  return (
    <ToolHoverCard
      tool={tool}
      side="top"
      align="start"
      showInstructions={true}
      instructionText="Click the × to remove this tool from your context"
    >
      <div>
        <Badge variant="secondary" className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer">
          <ToolServerIcon toolServerName={server.name} />
          <ToolStatusIcon enabled={enabled} />
          <span>{formatToolName(name)}</span>
          <button
            onClick={() => removeSelectedTool(tool)}
            className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
            type="button"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </Badge>
      </div>
    </ToolHoverCard>
  );
}
