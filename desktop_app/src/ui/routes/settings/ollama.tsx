import { createFileRoute } from '@tanstack/react-router';
import { AlertCircle, Bot, CheckCircle, Loader2 } from 'lucide-react';

import DetailedProgressBar from '@ui/components/DetailedProgressBar';
import { Alert, AlertDescription } from '@ui/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { useOllamaStore } from '@ui/stores/ollama-store';

export const Route = createFileRoute('/settings/ollama')({
  component: OllamaSettings,
});

function OllamaSettings() {
  const { requiredModelsStatus, requiredModelsDownloadProgress, loadingRequiredModels } = useOllamaStore();

  return (
    <div className="space-y-3">
      <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/20">
        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-800 dark:text-blue-200 inline-block">
          We use{' '}
          <a
            href="https://ollama.com"
            onClick={(e) => {
              e.preventDefault();
              window.electronAPI.openExternal('https://ollama.com');
            }}
            className="underline hover:no-underline font-medium"
          >
            Ollama
          </a>{' '}
          to power certain AI functionality locally on your device.
          <br />
          <br />
          Ollama runs completely offline, inside your application, and all data stays on your machine. We don't store or
          transmit any of your data to external servers when using Ollama-powered features.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Ollama Local LLM
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Required Models</h3>
            <p className="text-sm text-muted-foreground">
              We ensure that the following models are installed and available for use for various AI features throughout
              the application.
            </p>
            {loadingRequiredModels ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking model status...
              </div>
            ) : (
              <div className="space-y-2">
                {requiredModelsStatus.map(({ model: modelName, reason, installed }) => {
                  const modelDownloadProgress = requiredModelsDownloadProgress[modelName];
                  const iconDownloadProgressStatusMap = {
                    downloading: <Loader2 className="h-4 w-4 animate-spin" />,
                    verifying: <CheckCircle className="h-4 w-4 text-green-500" />,
                    completed: <CheckCircle className="h-4 w-4 text-green-500" />,
                    error: <AlertCircle className="h-4 w-4 text-red-500" />,
                  };
                  let icon: React.JSX.Element;

                  if (installed) {
                    icon = iconDownloadProgressStatusMap['completed'];
                  } else {
                    icon = iconDownloadProgressStatusMap[modelDownloadProgress?.status || 'verifying'];
                  }

                  return (
                    <DetailedProgressBar
                      key={modelName}
                      icon={icon}
                      title={modelName}
                      description={reason}
                      percentage={modelDownloadProgress?.progress}
                      error={modelDownloadProgress?.status === 'error' ? modelDownloadProgress?.message : null}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
