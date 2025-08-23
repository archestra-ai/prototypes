import { config } from '../config/index.js';
import { GoogleOAuthProvider } from './google.js';
import { SlackOAuthProvider } from './slack.js';
import { MSTeamsOAuthProvider } from './msteams.js';

// Provider registry
const providers = new Map();

// Initialize providers from config
export function initializeProviders() {
  // Google OAuth
  if (config.providers.google.clientId && config.providers.google.clientSecret) {
    providers.set('google', new GoogleOAuthProvider(config.providers.google));
    console.log('✓ Google OAuth provider initialized');
  }

  // Slack OAuth
  if (config.providers.slack.clientId && config.providers.slack.clientSecret) {
    providers.set('slack', new SlackOAuthProvider(config.providers.slack));
    console.log('✓ Slack OAuth provider initialized');
  }

  // MS Teams OAuth
  if (config.providers.msteams.clientId && config.providers.msteams.clientSecret) {
    providers.set('msteams', new MSTeamsOAuthProvider(config.providers.msteams));
    console.log('✓ MS Teams OAuth provider initialized');
  }

  if (providers.size === 0) {
    console.warn('⚠ No OAuth providers configured. Please check your .env file');
  }

  return providers;
}

// Get a specific provider
export function getProvider(name) {
  const provider = providers.get(name.toLowerCase());
  if (!provider) {
    throw new Error(`Provider '${name}' not found or not configured`);
  }
  return provider;
}

// Get all configured providers
export function getAllProviders() {
  return Array.from(providers.keys());
}