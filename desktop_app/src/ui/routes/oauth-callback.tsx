import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@ui/components/ui/alert';
import { Button } from '@ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/ui/card';
import { completeMcpServerOauth } from '@ui/lib/clients/archestra/api/gen';
import { useMcpServersStore } from '@ui/stores';

interface OAuthCallbackParams {
  service?: string;
  code?: string;
  state?: string;
  error?: string;
  // Legacy OAuth flow params
  access_token?: string;
  refresh_token?: string;
  expiry_date?: string;
}

export const Route = createFileRoute('/oauth-callback')({
  component: OAuthCallbackPage,
});

function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [oauthParams, setOauthParams] = useState<OAuthCallbackParams | null>(null);
  const { loadInstalledMcpServers } = useMcpServersStore();

  useEffect(() => {
    // Listen for OAuth callback from deep link
    const handleOAuthCallback = async (params: OAuthCallbackParams) => {
      console.log('OAuth callback received:', params);
      setOauthParams(params);

      // Get the state from session storage if not in params
      const state = params.state || sessionStorage.getItem('oauth_state');

      // Check if we have the required parameters
      // New flow: we get code instead of tokens
      if (params.code && state) {
        // New PKCE flow - exchange code for tokens
      } else if (params.access_token && params.refresh_token && state) {
        // Old flow - tokens provided directly
      } else {
        setStatus('error');
        setErrorMessage('Missing required OAuth parameters');
        return;
      }

      try {
        // Validate service parameter
        const service = params.service || 'google';
        const allowedServices = ['google', 'slack', 'slack-browser', 'linkedin'];
        if (!allowedServices.includes(service)) {
          throw new Error(`Invalid OAuth service: ${service}`);
        }

        // Complete the OAuth flow by sending code or tokens to backend
        const body = {
          service: service,
          state: state,
        } as any;

        if (params.code) {
          // New PKCE flow - send code for exchange
          body.code = params.code;
        } else {
          // Old flow - send tokens directly
          body.access_token = params.access_token;
          body.refresh_token = params.refresh_token;
          body.expiry_date = params.expiry_date;
        }

        const { data, error } = await completeMcpServerOauth({ body });

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
    if (urlParams.get('code') || urlParams.get('access_token')) {
      handleOAuthCallback({
        service: urlParams.get('service'),
        code: urlParams.get('code'),
        access_token: urlParams.get('access_token'),
        refresh_token: urlParams.get('refresh_token'),
        expiry_date: urlParams.get('expiry_date'),
        state: urlParams.get('state'),
        error: urlParams.get('error'),
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
                {JSON.stringify(
                  {
                    ...oauthParams,
                    // Redact sensitive tokens
                    access_token: oauthParams.access_token ? '[REDACTED]' : undefined,
                    refresh_token: oauthParams.refresh_token ? '[REDACTED]' : undefined,
                    code: oauthParams.code ? '[REDACTED]' : undefined,
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
