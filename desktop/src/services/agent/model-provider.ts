import { createOllama } from 'ollama-ai-provider-v2';

import { ARCHESTRA_SERVER_OLLAMA_PROXY_URL } from '@/consts';

/**
 * Interface for model providers that can be used with the AI SDK
 */
export interface ModelProvider {
  createModel(modelName: string): any; // AI SDK model instance
  supportsTools(): boolean;
  supportsStreaming(): boolean;
  getProviderName(): string;
  getModelDisplayName(modelName: string): string;
}

/**
 * Ollama model provider implementation
 */
export class OllamaProvider implements ModelProvider {
  private modelName: string;
  private debugMode: boolean = true; // Enable debug mode

  constructor(modelName: string, baseURL?: string) {
    this.modelName = modelName;
    // Use the baseURL from Ollama store if not provided
    const url = baseURL || this.getOllamaBaseURL();

    console.log('🔍 [OllamaProvider] Initializing with:', {
      modelName,
      baseURL: url,
    });

    // Add network request interceptor for debugging
    if (this.debugMode) {
      this.interceptFetchRequests();
    }

    // Do NOT add /api suffix - the proxy URL already includes the full path
    console.log('🔧 [OllamaProvider] Creating Ollama instance with base URL:', url);

    // Note: Using custom Ollama implementation instead of ollama-ai-provider
  }

  private interceptFetchRequests() {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      const [resource, options] = args;

      // Log all requests to Ollama endpoints
      if (typeof resource === 'string' && resource.includes('ollama')) {
        console.log('🌐 [FETCH Debug] Request:', {
          url: resource,
          method: options?.method || 'GET',
          hasBody: !!options?.body,
        });
      }

      try {
        const response = await originalFetch(...args);

        // Log response status
        if (typeof resource === 'string' && resource.includes('localhost')) {
          console.log('📡 [FETCH Debug] Response:', {
            url: resource,
            status: response.status,
            ok: response.ok,
          });

          // Clone response to read body without consuming it
          if (!response.ok) {
            const clonedResponse = response.clone();
            try {
              const errorBody = await clonedResponse.text();
              console.error('❌ [FETCH Debug] Error response body:', errorBody);
            } catch (e) {
              console.error('❌ [FETCH Debug] Could not read error body');
            }
          }
        }

        return response;
      } catch (error) {
        console.error('💥 [FETCH Debug] Request failed:', {
          url: resource,
          error: error instanceof Error ? error.message : error,
        });
        throw error;
      }
    };
  }

  private getOllamaBaseURL(): string {
    return ARCHESTRA_SERVER_OLLAMA_PROXY_URL + '/api';
  }

  createModel(modelName: string) {
    // Try using ollama-ai-provider-v2 with better debugging
    try {
      console.log('🔗 [OllamaProvider] Attempting to use ollama-ai-provider-v2');

      // Get the base URL with /api suffix since the package appends endpoints directly
      const baseURL = ARCHESTRA_SERVER_OLLAMA_PROXY_URL + '/api';

      console.log('🔗 [OllamaProvider] Creating ollama provider with baseURL:', baseURL);
      console.log('🔗 [OllamaProvider] Full proxy URL:', ARCHESTRA_SERVER_OLLAMA_PROXY_URL);
      console.log('🔗 [OllamaProvider] Expected final URL for chat:', baseURL + '/chat');

      // Create a custom Ollama provider instance with our proxy URL
      const ollamaProvider = createOllama({
        baseURL: baseURL, // The package will append /chat directly
        compatibility: 'compatible', // Use 'compatible' mode for better flexibility
      });

      console.log('🔗 [OllamaProvider] createOllama succeeded, now creating model');

      // Create and return the model
      const model = ollamaProvider(modelName);

      console.log('✅ [OllamaProvider] Model created successfully with ollama-ai-provider-v2');
      console.log('📊 [OllamaProvider] Model details:', {
        provider: model.provider,
        modelId: model.modelId,
        specificationVersion: model.specificationVersion,
      });
      return model;
    } catch (error) {
      console.error('❌ [OllamaProvider] Failed to create model with ollama-ai-provider-v2:', error);
      console.error('📋 [OllamaProvider] Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  supportsTools(): boolean {
    // Check if the Ollama model supports tools based on model name
    // This list is based on Ollama documentation and chat-store implementation
    return (
      this.modelName.includes('qwen') ||
      this.modelName.includes('functionary') ||
      this.modelName.includes('mistral') ||
      this.modelName.includes('command') ||
      this.modelName.includes('hermes') ||
      this.modelName.includes('llama3.1') ||
      this.modelName.includes('llama-3.1') ||
      this.modelName.includes('llama3.2') ||
      this.modelName.includes('llama-3.2') ||
      this.modelName.includes('phi') ||
      this.modelName.includes('granite')
    );
  }

  supportsStreaming(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'ollama';
  }

  getModelDisplayName(modelName: string): string {
    return modelName;
  }
}

/**
 * Factory for creating model providers based on model name
 */
export class ModelProviderFactory {
  static create(modelName: string): ModelProvider {
    // Always use Ollama provider
    return new OllamaProvider(modelName);
  }

  static getProviderForModel(_modelName: string): string {
    // Always return 'ollama' since we only support Ollama
    return 'ollama';
  }
}

/**
 * Model capabilities checker
 */
export class ModelCapabilities {
  static supportsTools(modelName: string): boolean {
    const provider = ModelProviderFactory.create(modelName);
    return provider.supportsTools();
  }

  static supportsStreaming(modelName: string): boolean {
    const provider = ModelProviderFactory.create(modelName);
    return provider.supportsStreaming();
  }

  static getProviderName(modelName: string): string {
    const provider = ModelProviderFactory.create(modelName);
    return provider.getProviderName();
  }
}
