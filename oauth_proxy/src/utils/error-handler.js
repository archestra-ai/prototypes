/**
 * Centralized Error Handler for OAuth Proxy
 * 
 * Provides consistent error responses and logging
 */

/**
 * OAuth error response structure
 */
export function createOAuthErrorResponse(error, description, status = 400) {
  return {
    error: error,
    error_description: description,
    status: status,
  };
}

/**
 * Provider-specific error enhancement
 */
export function enhanceProviderError(error, provider) {
  const providerErrors = {
    msteams: {
      invalid_client: 'Azure AD client configuration error. Verify your app registration.',
      invalid_grant: 'Authorization code or refresh token expired. User must re-authenticate.',
      unauthorized_client: 'Azure AD app lacks required permissions or admin consent.',
      invalid_scope: 'Invalid Microsoft Graph API scopes requested.',
    },
    google: {
      invalid_client: 'Google OAuth client configuration error.',
      invalid_grant: 'Google authorization expired. User must re-authenticate.',
      access_denied: 'User denied access to Google account.',
    },
    slack: {
      invalid_client: 'Slack app configuration error.',
      invalid_grant: 'Slack authorization expired.',
      invalid_scope: 'Invalid Slack OAuth scopes requested.',
    },
  };

  const providerSpecificErrors = providerErrors[provider] || {};
  const enhancedDescription = providerSpecificErrors[error.error] || error.error_description;

  return {
    ...error,
    error_description: enhancedDescription,
    provider: provider,
  };
}

/**
 * Logs OAuth errors with context
 */
export function logOAuthError(logger, error, context) {
  const logData = {
    error: error.error || error.message,
    description: error.error_description,
    provider: context.provider,
    grant_type: context.grant_type,
    timestamp: new Date().toISOString(),
  };

  // Don't log sensitive data
  if (context.client_id) {
    logData.client_id = context.client_id.substring(0, 8) + '...';
  }

  logger.error('OAuth error occurred:', logData);
}

/**
 * Express middleware for OAuth error handling
 */
export function oauthErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // Log the error
  logOAuthError(req.log || console, err, {
    provider: req.body?.provider || req.query?.provider,
    grant_type: req.body?.grant_type,
    client_id: req.body?.client_id,
  });

  // Determine status code
  let status = err.status || 400;
  if (err.error === 'server_error') {
    status = 500;
  } else if (err.error === 'temporarily_unavailable') {
    status = 503;
  }

  // Send OAuth-compliant error response
  res.status(status).json({
    error: err.error || 'server_error',
    error_description: err.error_description || err.message || 'An unexpected error occurred',
  });
}

/**
 * Validates required OAuth parameters
 */
export function validateOAuthRequest(params, requiredFields) {
  const missing = requiredFields.filter(field => !params[field]);
  
  if (missing.length > 0) {
    throw createOAuthErrorResponse(
      'invalid_request',
      `Missing required parameters: ${missing.join(', ')}`
    );
  }
}

/**
 * Safe error serialization for logging
 */
export function serializeError(error) {
  return {
    message: error.message,
    stack: error.stack,
    code: error.code,
    statusCode: error.statusCode,
    details: error.details,
  };
}