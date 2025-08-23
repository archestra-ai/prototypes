/**
 * OAuth Error Types and Utilities
 *
 * Provides consistent error handling for OAuth operations
 */

export enum OAuthErrorCode {
  // Configuration errors
  INVALID_PROVIDER = 'INVALID_PROVIDER',
  MISSING_CLIENT_ID = 'MISSING_CLIENT_ID',
  INVALID_TENANT_ID = 'INVALID_TENANT_ID',

  // Flow errors
  INVALID_STATE = 'INVALID_STATE',
  EXPIRED_STATE = 'EXPIRED_STATE',
  CODE_EXCHANGE_FAILED = 'CODE_EXCHANGE_FAILED',
  TOKEN_REFRESH_FAILED = 'TOKEN_REFRESH_FAILED',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROXY_UNREACHABLE = 'PROXY_UNREACHABLE',

  // Provider-specific errors
  INVALID_GRANT = 'INVALID_GRANT',
  UNAUTHORIZED_CLIENT = 'UNAUTHORIZED_CLIENT',
  INVALID_SCOPE = 'INVALID_SCOPE',
  CONSENT_REQUIRED = 'CONSENT_REQUIRED',
}

export class OAuthError extends Error {
  constructor(
    public code: OAuthErrorCode,
    message: string,
    public details?: any,
    public provider?: string
  ) {
    super(message);
    this.name = 'OAuthError';
  }

  /**
   * Creates a user-friendly error message
   */
  getUserMessage(): string {
    switch (this.code) {
      case OAuthErrorCode.INVALID_PROVIDER:
        return 'The selected authentication provider is not available.';

      case OAuthErrorCode.MISSING_CLIENT_ID:
        return 'This authentication provider is not properly configured. Please contact support.';

      case OAuthErrorCode.INVALID_TENANT_ID:
        return 'The organization ID is invalid. Please check your configuration.';

      case OAuthErrorCode.INVALID_STATE:
        return 'The authentication request is invalid. Please try again.';

      case OAuthErrorCode.EXPIRED_STATE:
        return 'The authentication request has expired. Please try again.';

      case OAuthErrorCode.CODE_EXCHANGE_FAILED:
        return 'Failed to complete authentication. Please try again.';

      case OAuthErrorCode.TOKEN_REFRESH_FAILED:
        return 'Your session has expired. Please sign in again.';

      case OAuthErrorCode.NETWORK_ERROR:
        return 'Network error occurred. Please check your connection and try again.';

      case OAuthErrorCode.PROXY_UNREACHABLE:
        return 'Cannot connect to authentication service. Please try again later.';

      case OAuthErrorCode.INVALID_GRANT:
        return 'The authorization code has expired. Please try signing in again.';

      case OAuthErrorCode.UNAUTHORIZED_CLIENT:
        return 'This application is not authorized. Admin consent may be required.';

      case OAuthErrorCode.INVALID_SCOPE:
        return 'The requested permissions are invalid. Please contact support.';

      case OAuthErrorCode.CONSENT_REQUIRED:
        return 'Permission consent is required. Please approve the requested permissions.';

      default:
        return this.message || 'An authentication error occurred.';
    }
  }

  /**
   * Converts OAuth proxy errors to OAuthError
   */
  static fromProxyError(error: any, provider?: string): OAuthError {
    // Handle specific OAuth error codes
    if (error.error) {
      switch (error.error) {
        case 'invalid_grant':
          return new OAuthError(
            OAuthErrorCode.INVALID_GRANT,
            error.error_description || 'Invalid grant',
            error,
            provider
          );

        case 'unauthorized_client':
          return new OAuthError(
            OAuthErrorCode.UNAUTHORIZED_CLIENT,
            error.error_description || 'Unauthorized client',
            error,
            provider
          );

        case 'invalid_scope':
          return new OAuthError(
            OAuthErrorCode.INVALID_SCOPE,
            error.error_description || 'Invalid scope',
            error,
            provider
          );

        case 'consent_required':
          return new OAuthError(
            OAuthErrorCode.CONSENT_REQUIRED,
            error.error_description || 'Consent required',
            error,
            provider
          );
      }
    }

    // Default error
    return new OAuthError(
      OAuthErrorCode.CODE_EXCHANGE_FAILED,
      error.message || error.error_description || 'Token exchange failed',
      error,
      provider
    );
  }
}

/**
 * MS Teams specific error messages
 */
export const MS_TEAMS_ERROR_GUIDANCE = {
  [OAuthErrorCode.INVALID_GRANT]:
    'The authorization code or refresh token has expired. This often happens if you took too long to complete sign-in.',

  [OAuthErrorCode.UNAUTHORIZED_CLIENT]:
    'Your Azure AD app may not have the required permissions. Ensure admin consent has been granted for Microsoft Graph API access.',

  [OAuthErrorCode.INVALID_SCOPE]:
    'One or more Microsoft Graph permissions are invalid or require admin consent. Check your Azure AD app configuration.',

  [OAuthErrorCode.INVALID_TENANT_ID]:
    'The Azure AD tenant ID is invalid. It should be either a GUID (e.g., 12345678-1234-1234-1234-123456789012) ' +
    'or a domain (e.g., contoso.onmicrosoft.com).',
};
