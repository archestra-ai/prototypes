import { AlertCircle, CheckCircle, ChevronDown, Loader2, Server, Settings, XCircle } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/ui/collapsible';
import { Progress } from '@ui/components/ui/progress';
import { useMcpServersStore, useSandboxStore } from '@ui/stores';

import McpServer from './McpServer';
import SettingsDialog from './SettingsDialog';

interface McpServersProps {}

export default function McpServers(_props: McpServersProps) {
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const {
    isRunning: sandboxIsRunning,
    statusSummary: {
      status: sandboxStatus,
      runtime: {
        startupPercentage: runtimeStartupPercentage,
        startupMessage: runtimeStartupMessage,
        startupError: runtimeStartupError,
        baseImage: {
          pullPercentage: baseImagePullPercentage,
          pullMessage: baseImagePullMessage,
          pullError: baseImagePullError,
        },
      },
    },
  } = useSandboxStore();
  const { installedMcpServers, loadingInstalledMcpServers, errorLoadingInstalledMcpServers } = useMcpServersStore();

  const totalNumberOfMcpTools = installedMcpServers.reduce((acc, server) => acc + server.tools.length, 0);
  const hasErrorLoadingInstalledMcpServers = errorLoadingInstalledMcpServers !== null;

  const getOverallSandboxStatus = () => {
    if (runtimeStartupError || baseImagePullError) {
      return {
        icon: <XCircle className="h-5 w-5 text-destructive" />,
        title: 'Sandbox Initialization Failed',
        description: runtimeStartupError || baseImagePullError,
      };
    }

    if (runtimeStartupPercentage > 0 && runtimeStartupPercentage < 100) {
      return {
        icon: <Loader2 className="h-5 w-5 animate-spin" />,
        title: 'Initializing Container Runtime',
        description: runtimeStartupMessage || 'Setting up Podman...',
      };
    }

    if (baseImagePullPercentage > 0 && baseImagePullPercentage < 100) {
      return {
        icon: <Loader2 className="h-5 w-5 animate-spin" />,
        title: 'Fetching Base Image',
        description: baseImagePullMessage || 'Downloading container base image...',
      };
    }

    if (baseImagePullPercentage === 100 && runtimeStartupPercentage < 100) {
      return {
        icon: <Loader2 className="h-5 w-5 animate-spin" />,
        title: 'Finalizing Sandbox Setup',
        description: 'Almost ready...',
      };
    }

    if (runtimeStartupPercentage === 100) {
      return {
        icon: <CheckCircle className="h-5 w-5 text-green-500" />,
        title: 'Sandbox Ready',
        description: 'Container environment is up and running',
      };
    }

    return {
      icon: <Loader2 className="h-5 w-5 animate-spin" />,
      title: 'Initializing Sandbox',
      description: 'Preparing sandbox environment...',
    };
  };

  const overallSandboxStatus = getOverallSandboxStatus();

  if (!sandboxIsRunning) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Sandbox Environment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            {overallSandboxStatus.icon}
            <div className="flex-1 space-y-1">
              <p className="font-medium">{overallSandboxStatus.title}</p>
              <p className="text-sm text-muted-foreground">{overallSandboxStatus.description}</p>
            </div>
          </div>

          {runtimeStartupPercentage > 0 && runtimeStartupPercentage < 100 && (
            <div className="space-y-2">
              <Progress value={runtimeStartupPercentage} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{runtimeStartupPercentage}%</p>
            </div>
          )}

          {baseImagePullPercentage > 0 && baseImagePullPercentage < 100 && (
            <div className="space-y-2">
              <Progress value={baseImagePullPercentage} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{baseImagePullPercentage}%</p>
            </div>
          )}

          {(runtimeStartupError || baseImagePullError) && (
            <div className="rounded-md bg-destructive/10 p-3">
              <p className="text-sm text-destructive">Please check the logs for more information about the failure.</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible defaultOpen>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-6">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex-1 justify-between p-0 h-auto cursor-pointer">
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                MCP Servers & Tools
                {loadingInstalledMcpServers && <Loader2 className="h-4 w-4 animate-spin" />}
              </CardTitle>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 ml-2 cursor-pointer"
            onClick={() => setSettingsDialogOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {hasErrorLoadingInstalledMcpServers && (
              <div className="text-center py-4 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Error loading MCP servers: {errorLoadingInstalledMcpServers}</p>
              </div>
            )}
            {loadingInstalledMcpServers && (
              <div className="text-center py-4 text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                <p>Loading MCP servers...</p>
              </div>
            )}
            {installedMcpServers.length === 0 && !loadingInstalledMcpServers && !hasErrorLoadingInstalledMcpServers ? (
              <div className="text-center py-4 text-muted-foreground">
                <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No MCP servers configured</p>
              </div>
            ) : (
              <div className="space-y-3">
                {installedMcpServers.map((server) => (
                  <McpServer key={server.name} mcpServer={server} />
                ))}
              </div>
            )}

            {installedMcpServers.length > 0 && (
              <div className="border-t pt-3 mt-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Total: {installedMcpServers.length} server
                    {installedMcpServers.length !== 1 ? 's' : ''}, {totalNumberOfMcpTools} tool
                    {totalNumberOfMcpTools !== 1 ? 's' : ''}
                  </span>
                  <span>{installedMcpServers.filter((s) => s.state === 'running').length} connected</span>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>

      <SettingsDialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen} />
    </Collapsible>
  );
}
