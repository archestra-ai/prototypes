import { Bot, Loader2, Pause, Play, Settings, Square } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import { useOllamaStore } from '@/stores/ollama-store';

interface AgentControlPanelProps {
  className?: string;
}

export function AgentControlPanel({ className }: AgentControlPanelProps) {
  const {
    mode,
    isAgentActive,
    currentObjective,
    reasoningMode,
    preferences,
    activateAgent,
    pauseAgent,
    resumeAgent,
    stopAgent,
    setReasoningMode,
    addAutoApproveCategory,
    removeAutoApproveCategory,
  } = useAgentStore();

  const { installedMCPServers } = useMCPServersStore();
  const { selectedModel, installedModels } = useOllamaStore();

  const [objective, setObjective] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Handle agent activation
  const handleActivate = async () => {
    if (!objective.trim()) return;

    try {
      await activateAgent(objective.trim());
      setObjective(''); // Clear input after activation
    } catch (error) {
      console.error('Failed to activate agent:', error);
    }
  };

  // Handle key press in objective input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isAgentActive && objective.trim()) {
        handleActivate();
      }
    }
  };

  // Get status color based on mode
  const getStatusColor = () => {
    switch (mode) {
      case 'initializing':
      case 'planning':
        return 'text-yellow-600';
      case 'executing':
        return 'text-green-600';
      case 'paused':
        return 'text-orange-600';
      case 'completed':
        return 'text-blue-600';
      default:
        return 'text-muted-foreground';
    }
  };

  // Format mode for display
  const formatMode = (mode: string) => {
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  };

  return (
    <Card className={cn('transition-all duration-300', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle>Agent Control</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isAgentActive && <span className={cn('text-sm font-medium', getStatusColor())}>{formatMode(mode)}</span>}
          </div>
        </div>
        <CardDescription>
          {isAgentActive ? currentObjective || 'Agent is active' : 'Activate an AI agent to execute tasks autonomously'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Objective Input */}
        {!isAgentActive && (
          <div className="space-y-2">
            <Label htmlFor="objective">Objective</Label>
            <div className="flex gap-2">
              <Input
                id="objective"
                placeholder="What would you like the agent to accomplish?"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isAgentActive}
                className="flex-1"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleActivate} disabled={!objective.trim() || isAgentActive} size="default">
                      <Play className="h-4 w-4 mr-2" />
                      Activate
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Start the agent with this objective</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        {/* Control Buttons */}
        {isAgentActive && (
          <div className="flex gap-2">
            {mode === 'executing' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={pauseAgent}>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Temporarily pause agent execution</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {mode === 'paused' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={resumeAgent}>
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Resume agent execution</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {(mode === 'initializing' || mode === 'planning') && (
              <Button variant="outline" size="sm" disabled>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Preparing...
              </Button>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="destructive" size="sm" onClick={stopAgent}>
                    <Square className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Stop the agent and clear all tasks</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        <Separator />

        {/* Configuration Options */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="show-advanced" className="text-sm font-medium">
              Agent Configuration
            </Label>
            <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
              <Settings className="h-4 w-4 mr-2" />
              {showAdvanced ? 'Hide' : 'Show'} Settings
            </Button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 pl-2">
              {/* Model Selection */}
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Select value={selectedModel || ''} disabled={isAgentActive}>
                  <SelectTrigger id="model">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {installedModels.map((model) => (
                      <SelectItem key={model.name} value={model.name}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Reasoning Mode */}
              <div className="space-y-2">
                <Label htmlFor="reasoning-mode">Reasoning Verbosity</Label>
                <Select value={reasoningMode} onValueChange={setReasoningMode}>
                  <SelectTrigger id="reasoning-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="verbose">Verbose</SelectItem>
                    <SelectItem value="concise">Concise</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Auto-approve Categories */}
              <div className="space-y-2">
                <Label>Auto-approve Tool Categories</Label>
                <div className="space-y-2">
                  {(['read', 'search', 'write', 'execute'] as const).map((category) => {
                    const isApproved = preferences.autoApproveCategories.includes(category);
                    return (
                      <div key={category} className="flex items-center justify-between">
                        <Label htmlFor={`auto-approve-${category}`} className="text-sm font-normal capitalize">
                          {category} operations
                        </Label>
                        <Switch
                          id={`auto-approve-${category}`}
                          checked={isApproved}
                          onCheckedChange={(checked: boolean) => {
                            if (checked) {
                              addAutoApproveCategory(category);
                            } else {
                              removeAutoApproveCategory(category);
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Connected Servers Info */}
              {installedMCPServers.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">Available MCP Servers</Label>
                  <div className="text-xs text-muted-foreground">
                    {installedMCPServers.filter((s) => s.status === 'connected').length} of {installedMCPServers.length}{' '}
                    connected
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
