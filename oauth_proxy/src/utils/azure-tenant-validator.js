/**
 * Azure Tenant ID Validation Utilities
 * 
 * Validates and processes Azure AD tenant identifiers for MS Teams OAuth
 */

/**
 * Validates if a string is a valid Azure AD tenant ID
 * @param {string} tenantId - The tenant ID to validate
 * @returns {boolean} true if valid, false otherwise
 */
function isValidTenantId(tenantId) {
  if (!tenantId || typeof tenantId !== 'string') {
    return false;
  }

  const trimmedId = tenantId.trim();
  
  // Check for GUID format (case-insensitive)
  const isValidGuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trimmedId);
  
  // Check for domain format
  const isValidDomain = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(trimmedId);
  
  return isValidGuid || isValidDomain;
}

/**
 * Gets the Azure AD OAuth endpoint URL
 * @param {string|undefined} tenantId - The tenant ID (optional)
 * @param {'authorize'|'token'} endpointType - Type of endpoint
 * @returns {string} The complete OAuth endpoint URL
 */
function getAzureOAuthEndpoint(tenantId, endpointType) {
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

export { isValidTenantId, getAzureOAuthEndpoint };