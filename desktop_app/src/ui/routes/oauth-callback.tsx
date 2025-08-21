import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@ui/components/ui/alert';
import { Button } from '@ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/ui/card';
import { completeMcpServerOauth } from '@ui/lib/clients/archestra/api/gen';
import { useMcpServersStore } from '@ui/stores';

export const Route = createFileRoute('/oauth-callback')({
  component: OAuthCallbackPage,
});

function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [oauthParams, setOauthParams] = useState<any>(null);
  const { loadInstalledMcpServers } = useMcpServersStore();

  useEffect(() => {
    // Listen for OAuth callback from deep link
    const handleOAuthCallback = async (params: any) => {
      console.log('OAuth callback received:', params);
      setOauthParams(params);

      // Get the state from session storage if not in params
      const state = params.state || sessionStorage.getItem('oauth_state');

      // Check if we have the required parameters
      if (!params.access_token || !params.refresh_token || !state) {
        setStatus('error');
        setErrorMessage('Missing required OAuth parameters');
        return;
      }

      try {
        // Complete the OAuth flow by sending tokens to backend
        const { data, error } = await completeMcpServerOauth({
          body: {
            service: params.service || 'gmail',
            access_token: params.access_token,
            refresh_token: params.refresh_token,
            expiry_date: params.expiry_date,
            state: state,
          },
        });

        if (error) {
          throw new Error(error.error || 'Failed to complete OAuth');
        }

        if (data) {
          setStatus('success');
          // Reload installed servers to show the newly installed one
          await loadInstalledMcpServers();

          // Navigate to connectors page after a short delay
          setTimeout(() => {
            navigate({ to: '/connectors' });
          }, 2000);
        }
      } catch (error) {
        console.error('OAuth completion error:', error);
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Failed to complete OAuth installation');
      }
    };

    // Register the OAuth callback listener
    if (window.electronAPI?.onOAuthCallback) {
      window.electronAPI.onOAuthCallback(handleOAuthCallback);
    }

    // Also check URL parameters (for testing or direct navigation)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('access_token')) {
      handleOAuthCallback({
        service: urlParams.get('service'),
        access_token: urlParams.get('access_token'),
        refresh_token: urlParams.get('refresh_token'),
        expiry_date: urlParams.get('expiry_date'),
        state: urlParams.get('state'),
      });
    }

    // Cleanup listener on unmount
    return () => {
      if (window.electronAPI?.removeOAuthCallbackListener) {
        window.electronAPI.removeOAuthCallbackListener();
      }
    };
  }, [navigate, loadInstalledMcpServers]);

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>OAuth Authentication</CardTitle>
          <CardDescription>
            {status === 'processing' && 'Processing authentication...'}
            {status === 'success' && 'Authentication successful!'}
            {status === 'error' && 'Authentication failed'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'processing' && (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className="text-center text-muted-foreground">
                Completing OAuth authentication and installing MCP server...
              </p>
            </div>
          )}

          {status === 'success' && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>
                The MCP server has been successfully installed with OAuth authentication. Redirecting to connectors
                page...
              </AlertDescription>
            </Alert>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Authentication Error</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>

              <div className="flex justify-center">
                <Button onClick={() => navigate({ to: '/connectors' })}>Back to Connectors</Button>
              </div>
            </div>
          )}

          {oauthParams && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-muted-foreground">Debug Information</summary>
              <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto">
                {JSON.stringify(oauthParams, null, 2)}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
