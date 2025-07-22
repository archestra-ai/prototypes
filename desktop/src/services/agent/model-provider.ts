import { openai } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';

import { useOllamaStore } from '../../stores/ollama-store';

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
 * OpenAI model provider implementation
 */
export class OpenAIProvider implements ModelProvider {
  createModel(modelName: string) {
    // Remove 'gpt-' prefix if present for AI SDK compatibility
    const sdkModelName = modelName.startsWith('gpt-') ? modelName.substring(4) : modelName;
    return openai(sdkModelName);
  }

  supportsTools(): boolean {
    return true;
  }

  supportsStreaming(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'openai';
  }

  getModelDisplayName(modelName: string): string {
    return modelName;
  }
}

/**
 * Ollama model provider implementation
 */
export class OllamaProvider implements ModelProvider {
  private ollama: any;
  private modelName: string;

  constructor(modelName: string, baseURL?: string) {
    this.modelName = modelName;
    // Use the baseURL from Ollama store if not provided
    const url = baseURL || this.getOllamaBaseURL();
    this.ollama = createOllama({ baseURL: url });
  }

  private getOllamaBaseURL(): string {
    const { ollamaPort } = useOllamaStore.getState();
    if (!ollamaPort) {
      console.warn('Ollama port not initialized, using default');
      return 'http://localhost:11434';
    }
    return `http://localhost:${ollamaPort}`;
  }

  createModel(modelName: string) {
    return this.ollama(modelName);
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
  private static openAIModels = ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo', 'gpt-4-turbo'];

  static create(modelName: string): ModelProvider {
    // Check if it's an OpenAI model
    if (this.isOpenAIModel(modelName)) {
      return new OpenAIProvider();
    }

    // Default to Ollama for all other models
    return new OllamaProvider(modelName);
  }

  static isOpenAIModel(modelName: string): boolean {
    return this.openAIModels.some((m) => modelName.startsWith(m));
  }

  static getProviderForModel(modelName: string): string {
    return this.isOpenAIModel(modelName) ? 'openai' : 'ollama';
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
