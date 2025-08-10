import { CheckCircle, Loader2, Server, XCircle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Progress } from '@ui/components/ui/progress';
import { useSandboxStore } from '@ui/stores';

/**
 * TODO: finish getting this all wired up..
 */
export function SandboxStartupProgress() {
  const {
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

  const getOverallStatus = () => {
    if (runtimeStartupError) {
      return {
        icon: <XCircle className="h-5 w-5 text-destructive" />,
        title: 'Sandbox Initialization Failed',
        description: runtimeStartupError,
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
        description: 'Downloading container base image...',
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

        {runtimeStartupPercentage > 0 && runtimeStartupPercentage < 100 && (
          <div className="space-y-2">
            <Progress value={runtimeStartupPercentage} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">{runtimeStartupPercentage}%</p>
          </div>
        )}

        {runtimeStartupError && (
          <div className="rounded-md bg-destructive/10 p-3">
            <p className="text-sm text-destructive">Please check the logs for more information about the failure.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
