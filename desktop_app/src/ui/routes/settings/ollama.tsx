import { createFileRoute } from '@tanstack/react-router';
import { AlertCircle, Bot, CheckCircle, Loader2 } from 'lucide-react';

import { Alert, AlertDescription } from '@ui/components/ui/alert';
import { Badge } from '@ui/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Progress } from '@ui/components/ui/progress';
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
          to power certain AI functionality locally on your device. Ollama runs completely offline and all data stays on
          your machine. We don't store or transmit any of your data to external servers when using Ollama-powered
          features.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Ollama Local AI
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <CheckCircle className="h-3 w-3 mr-1" />
              Running
            </Badge>
            <span className="text-sm text-muted-foreground">
              Ollama server starts automatically with the application
            </span>
          </div>

          <Alert className="bg-blue-500/10 border-blue-500/20">
            <AlertDescription className="text-sm">
              Local AI models are now available for chat. The Ollama server runs in the background and manages itself
              automatically.
            </AlertDescription>
          </Alert>

          {/* Required Models Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Required Models</h3>
            {loadingRequiredModels ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking model status...
              </div>
            ) : (
              <div className="space-y-2">
                {requiredModelsStatus.map((model) => {
                  const progress = requiredModelsDownloadProgress[model.model];
                  const isDownloading = progress && progress.status !== 'completed' && progress.status !== 'error';

                  return (
                    <div key={model.model} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{model.model}</span>
                          {model.installed ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Installed
                            </Badge>
                          ) : isDownloading ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              {progress.status === 'verifying' ? 'Verifying' : 'Downloading'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                              Not Installed
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{model.reason}</p>
                        {isDownloading && progress.progress !== undefined && (
                          <div className="mt-2 space-y-1">
                            <Progress value={progress.progress} className="h-2" />
                            <p className="text-xs text-muted-foreground">
                              {progress.message || `${progress.progress}% complete`}
                            </p>
                          </div>
                        )}
                        {progress?.status === 'error' && (
                          <p className="text-xs text-red-600 mt-1">{progress.message || 'Download failed'}</p>
                        )}
                      </div>
                    </div>
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
