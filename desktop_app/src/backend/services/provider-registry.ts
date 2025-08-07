import { CloudProvider, SupportedCloudProviderTypes } from '@archestra/types';

// Provider definitions - easy to update in code
export const PROVIDER_REGISTRY: Record<SupportedCloudProviderTypes, CloudProvider> = {
  anthropic: {
    type: 'anthropic',
    name: 'Claude (Anthropic)',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyPlaceholder: 'sk-ant-api03-...',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    headers: {
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'messages-2023-12-15',
    },
  },
  openai: {
    type: 'openai',
    name: 'OpenAI',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    apiKeyPlaceholder: 'sk-...',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  deepseek: {
    type: 'deepseek',
    name: 'DeepSeek',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    apiKeyPlaceholder: 'sk-...',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  gemini: {
    type: 'gemini',
    name: 'Google Gemini',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    apiKeyPlaceholder: 'AIza...',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro'],
  },
};

// Helper function to get provider for a model
export function getProviderForModel(modelId: string): CloudProvider | null {
  for (const provider of Object.values(PROVIDER_REGISTRY)) {
    if (provider.models.includes(modelId)) {
      return provider;
    }
  }
  return null;
}
