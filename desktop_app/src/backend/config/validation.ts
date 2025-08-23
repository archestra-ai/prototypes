/**
 * Configuration Validation Module
 *
 * Validates OAuth provider configurations at startup
 */
import { getOAuthProviderNames, oauthProviders } from './oauth-providers';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates all OAuth provider configurations
 * @returns Validation result with errors and warnings
 */
export function validateOAuthProviders(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const providerNames = getOAuthProviderNames();

  for (const name of providerNames) {
    const provider = oauthProviders[name];

    // Validate required fields
    if (!provider.name) {
      errors.push(`Provider ${name}: Missing 'name' field`);
    }

    if (!provider.authorizationUrl) {
      errors.push(`Provider ${name}: Missing 'authorizationUrl'`);
    }

    if (!provider.scopes || provider.scopes.length === 0) {
      errors.push(`Provider ${name}: Missing or empty 'scopes'`);
    }

    if (!provider.clientId) {
      errors.push(`Provider ${name}: Missing 'clientId'`);
    }

    // Check for placeholder client IDs
    if (provider.clientId && provider.clientId.includes('not-configured')) {
      warnings.push(`Provider ${name}: Client ID not configured - OAuth will not be available`);
    }

    // Validate token configuration
    if (!provider.tokenHandler && !provider.tokenEnvVarPattern) {
      errors.push(`Provider ${name}: Must specify either 'tokenHandler' or 'tokenEnvVarPattern'`);
    }

    if (provider.tokenEnvVarPattern) {
      if (!provider.tokenEnvVarPattern.accessToken) {
        errors.push(`Provider ${name}: Missing 'accessToken' in tokenEnvVarPattern`);
      }
    }

    // Provider-specific validations
    if (name === 'msteams') {
      validateMSTeamsProvider(provider, warnings);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * MS Teams specific validation
 */
function validateMSTeamsProvider(provider: any, warnings: string[]): void {
  // Check if tenant ID is configured
  if (!process.env.MSTEAMS_TENANT_ID) {
    warnings.push(
      'MS Teams: MSTEAMS_TENANT_ID not set. Using common endpoint which allows any Azure AD user. ' +
        'Set MSTEAMS_TENANT_ID for better security.'
    );
  }

  // Check for required MS Graph permissions
  const requiredScopes = ['offline_access', 'User.Read'];
  const missingScopes = requiredScopes.filter(
    (scope) => !provider.scopes.some((s: string) => s.toLowerCase() === scope.toLowerCase())
  );

  if (missingScopes.length > 0) {
    warnings.push(`MS Teams: Missing recommended scopes: ${missingScopes.join(', ')}`);
  }
}

/**
 * Logs validation results
 */
export function logValidationResults(result: ValidationResult): void {
  if (result.errors.length > 0) {
    console.error('OAuth Provider Configuration Errors:');
    result.errors.forEach((error) => console.error(`  ❌ ${error}`));
  }

  if (result.warnings.length > 0) {
    console.warn('OAuth Provider Configuration Warnings:');
    result.warnings.forEach((warning) => console.warn(`  ⚠️  ${warning}`));
  }

  if (result.valid && result.warnings.length === 0) {
    console.log('✅ OAuth provider configurations validated successfully');
  }
}
