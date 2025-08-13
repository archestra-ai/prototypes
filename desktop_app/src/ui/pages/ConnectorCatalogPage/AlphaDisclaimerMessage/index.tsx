import { Info } from 'lucide-react';

import { Alert, AlertDescription } from '@ui/components/ui/alert';

interface AlphaDisclaimerMessageProps {}

export default function AlphaDisclaimerMessage(_props: AlphaDisclaimerMessageProps) {
  return (
    <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <AlertDescription className="text-blue-900 dark:text-blue-100">
        <p>
          Archestra's{' '}
          <a
            href="https://www.archestra.ai/mcp-catalog"
            className="underline hover:no-underline font-medium"
            onClick={(e) => {
              e.preventDefault();
              window.electronAPI.openExternal('https://www.archestra.ai/mcp-catalog');
            }}
          >
            MCP Catalog
          </a>{' '}
          is currently in alpha-stage. While testing out any of the connectors, if you experience <em>any</em> issues,
          feel free to{' '}
          <a
            href="https://github.com/archestra-ai/website/issues/new"
            className="underline hover:no-underline font-medium"
            onClick={(e) => {
              e.preventDefault();
              window.electronAPI.openExternal('https://github.com/archestra-ai/website/issues/new');
            }}
          >
            open an issue
          </a>{' '}
          or{' '}
          <a
            href="https://github.com/archestra-ai/website/tree/main/app/app/mcp-catalog"
            className="underline hover:no-underline font-medium"
            onClick={(e) => {
              e.preventDefault();
              window.electronAPI.openExternal('https://github.com/archestra-ai/website/tree/main/app/app/mcp-catalog');
            }}
          >
            pull-request
          </a>{' '}
          🙂
        </p>
      </AlertDescription>
    </Alert>
  );
}
