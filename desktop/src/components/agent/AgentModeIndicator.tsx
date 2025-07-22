import { Brain, Loader2, Pause, Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent-store';
import { AgentMode } from '@/types/agent';

interface AgentModeIndicatorProps {
  className?: string;
}

export function AgentModeIndicator({ className }: AgentModeIndicatorProps) {
  const mode = useAgentStore((state) => state.mode);
  const isAgentActive = useAgentStore((state) => state.isAgentActive);
  const currentObjective = useAgentStore((state) => state.currentObjective);

  const [isPulsing, setIsPulsing] = useState(false);

  // Trigger pulse animation on state changes
  useEffect(() => {
    if (mode !== 'idle') {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  if (!isAgentActive) {
    return null;
  }

  const getModeConfig = (mode: AgentMode) => {
    switch (mode) {
      case 'initializing':
        return {
          icon: Loader2,
          label: 'Initializing',
          variant: 'secondary' as const,
          iconClassName: 'animate-spin',
          description: 'Setting up agent...',
        };
      case 'planning':
        return {
          icon: Brain,
          label: 'Planning',
          variant: 'secondary' as const,
          iconClassName: 'animate-pulse',
          description: 'Creating task plan...',
        };
      case 'executing':
        return {
          icon: Play,
          label: 'Executing',
          variant: 'default' as const,
          iconClassName: '',
          description: currentObjective || 'Running tasks...',
        };
      case 'paused':
        return {
          icon: Pause,
          label: 'Paused',
          variant: 'outline' as const,
          iconClassName: '',
          description: 'Agent paused',
        };
      case 'completed':
        return {
          icon: Square,
          label: 'Completed',
          variant: 'secondary' as const,
          iconClassName: '',
          description: 'Tasks completed',
        };
      default:
        return null;
    }
  };

  const config = getModeConfig(mode);
  if (!config) return null;

  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-2 transition-all duration-300', isPulsing && 'scale-105', className)}>
      <Badge
        variant={config.variant}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1',
          'transition-all duration-300',
          mode === 'executing' && 'animate-pulse'
        )}
      >
        <Icon className={cn('h-3 w-3', config.iconClassName)} />
        <span className="font-medium">{config.label}</span>
      </Badge>
      {config.description && (
        <span className="text-sm text-muted-foreground truncate max-w-[200px]">{config.description}</span>
      )}
    </div>
  );
}
