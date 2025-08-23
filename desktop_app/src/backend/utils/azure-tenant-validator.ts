/**
 * Azure Tenant ID Validation Utilities
 *
 * Validates and processes Azure AD tenant identifiers for MS Teams OAuth
 */

/**
 * Validates if a string is a valid Azure AD tenant ID
 * Tenant IDs can be either:
 * - GUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * - Domain format: contoso.onmicrosoft.com or contoso.com
 *
 * @param tenantId - The tenant ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidTenantId(tenantId: string): boolean {
  if (!tenantId || typeof tenantId !== 'string') {
    return false;
  }

  const trimmedId = tenantId.trim();

  // Check for GUID format (case-insensitive)
  const isValidGuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trimmedId);

  // Check for domain format (must have at least one dot and valid TLD)
  const isValidDomain = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(trimmedId);

  return isValidGuid || isValidDomain;
}

/**
 * Gets the Azure AD OAuth endpoint URL for a given tenant
 * Falls back to 'common' endpoint if tenant ID is invalid
 *
 * @param tenantId - The tenant ID (optional)
 * @param endpointType - Type of endpoint ('authorize' or 'token')
 * @returns The complete OAuth endpoint URL
 */
export function getAzureOAuthEndpoint(tenantId: string | undefined, endpointType: 'authorize' | 'token'): string {
  const baseUrl = 'https://login.microsoftonline.com';
  const endpoint = endpointType === 'authorize' ? 'authorize' : 'token';

  if (tenantId?.trim() && isValidTenantId(tenantId.trim())) {
    return `${baseUrl}/${tenantId.trim()}/oauth2/v2.0/${endpoint}`;
  }

  // Log warning if tenant ID was provided but invalid
  if (tenantId?.trim()) {
    console.warn(
      `Invalid MSTEAMS_TENANT_ID format: ${tenantId}. Using 'common' endpoint. ` +
        `Valid formats: GUID (e.g., 12345678-1234-1234-1234-123456789012) or ` +
        `domain (e.g., contoso.onmicrosoft.com)`
    );
  }

  return `${baseUrl}/common/oauth2/v2.0/${endpoint}`;
}

/**
 * Configuration for MS Teams OAuth endpoints
 */
export const MS_TEAMS_OAUTH_CONFIG = {
  scopes: {
    required: [
      'offline_access', // Required for refresh tokens
      'User.Read', // Basic user profile
    ],
    teams: [
      'ChannelMessage.Send', // Send messages to channels
      'Chat.Create', // Create new chats
      'Chat.ReadWrite', // Read and write to chats
      'Team.ReadBasic.All', // Read basic team info
      'TeamMember.Read.All', // Read team member info
    ],
  },
  endpoints: {
    base: 'https://login.microsoftonline.com',
    common: 'common',
    v2Path: 'oauth2/v2.0',
  },
  validation: {
    guidPattern: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
    domainPattern: /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/,
  },
};
