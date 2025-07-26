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

  constructor(modelName: string, baseURL?: string) {
    this.modelName = modelName;
    // Use the baseURL from Ollama store if not provided
    const url = baseURL || this.getOllamaBaseURL();

    // Do NOT add /api suffix - the proxy URL already includes the full path

    // Note: Using custom Ollama implementation instead of ollama-ai-provider
  }

  private getOllamaBaseURL(): string {
    return ARCHESTRA_SERVER_OLLAMA_PROXY_URL + '/api';
  }

  createModel(modelName: string) {
    // Try using ollama-ai-provider-v2 with better debugging
    try {
      // Get the base URL with /api suffix since the package appends endpoints directly
      const baseURL = ARCHESTRA_SERVER_OLLAMA_PROXY_URL + '/api';

      // Create a custom Ollama provider instance with our proxy URL
      const ollamaProvider = createOllama({
        baseURL: baseURL, // The package will append /chat directly
        compatibility: 'compatible', // Use 'compatible' mode for better flexibility
      });

      // Create and return the model
      const model = ollamaProvider(modelName);

      return model;
    } catch (error) {}
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
