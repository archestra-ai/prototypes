import { CheckCircle, Loader2, Package, Server, XCircle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Progress } from '@ui/components/ui/progress';
import { useSandboxStore } from '@ui/stores/sandbox-store';

export function SandboxStartupProgress() {
  const {
    isInitialized,
    initializationError,
    podmanMachineProgress,
    podmanMachineMessage,
    isFetchingBaseImage,
    baseImageFetched,
  } = useSandboxStore();

  const getOverallStatus = () => {
    if (initializationError) {
      return {
        icon: <XCircle className="h-5 w-5 text-destructive" />,
        title: 'Sandbox Initialization Failed',
        description: initializationError,
      };
    }

    if (podmanMachineProgress > 0 && podmanMachineProgress < 100) {
      return {
        icon: <Loader2 className="h-5 w-5 animate-spin" />,
        title: 'Initializing Container Runtime',
        description: podmanMachineMessage || 'Setting up Podman...',
      };
    }

    if (isFetchingBaseImage) {
      return {
        icon: <Loader2 className="h-5 w-5 animate-spin" />,
        title: 'Fetching Base Image',
        description: 'Downloading container base image...',
      };
    }

    if (baseImageFetched && !isInitialized) {
      return {
        icon: <Loader2 className="h-5 w-5 animate-spin" />,
        title: 'Finalizing Sandbox Setup',
        description: 'Almost ready...',
      };
    }

    if (isInitialized) {
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

  const status = getOverallStatus();

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
          {status.icon}
          <div className="flex-1 space-y-1">
            <p className="font-medium">{status.title}</p>
            <p className="text-sm text-muted-foreground">{status.description}</p>
          </div>
        </div>

        {podmanMachineProgress > 0 && podmanMachineProgress < 100 && (
          <div className="space-y-2">
            <Progress value={podmanMachineProgress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">{podmanMachineProgress}%</p>
          </div>
        )}

        {initializationError && (
          <div className="rounded-md bg-destructive/10 p-3">
            <p className="text-sm text-destructive">
              Please check the logs for more information about the failure.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}