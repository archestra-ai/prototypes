import { createFileRoute } from '@tanstack/react-router';
import { AlertCircle, Bot, CheckCircle } from 'lucide-react';

import { Alert, AlertDescription } from '@ui/components/ui/alert';
import { Badge } from '@ui/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';

export const Route = createFileRoute('/settings/ollama')({
  component: OllamaSettings,
});

function OllamaSettings() {
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
        </CardContent>
      </Card>
    </div>
  );
}
