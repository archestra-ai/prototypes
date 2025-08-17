import { createFileRoute } from '@tanstack/react-router';
import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription } from '@ui/components/ui/alert';

export const Route = createFileRoute('/settings/ollama')({
  component: OllamaSettings,
});

function OllamaSettings() {
  return (
    <div className="space-y-6">
      <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/20">
        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
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
    </div>
  );
}
