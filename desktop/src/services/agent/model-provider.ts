import { LanguageModelV1, LanguageModelV1StreamPart } from '@ai-sdk/provider';
import { openai } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';

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

    this.ollama = createOllama({ baseURL: url });
  }

  private interceptFetchRequests() {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      const [resource, config] = args;

      // Log outgoing requests
      if (typeof resource === 'string' && resource.includes('localhost')) {
        console.log('🌐 [FETCH Debug] Outgoing request:', {
          url: resource,
          method: config?.method || 'GET',
          headers: config?.headers,
          body: config?.body ? (typeof config.body === 'string' ? JSON.parse(config.body) : config.body) : undefined,
        });
      }

      try {
        const response = await originalFetch(...args);

        // Log response status
        if (typeof resource === 'string' && resource.includes('localhost')) {
          console.log('📥 [FETCH Debug] Response:', {
            url: resource,
            status: response.status,
            statusText: response.statusText,
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

  async testOpenAICompatibility(): Promise<boolean> {
    const baseURL = this.getOllamaBaseURL();
    const openAIEndpoint = `${baseURL}/v1/chat/completions`;

    console.log('🧪 [OllamaProvider] Testing OpenAI compatibility at:', openAIEndpoint);

    try {
      const response = await fetch(openAIEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        }),
      });

      console.log('📊 [OllamaProvider] OpenAI compatibility test result:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [OllamaProvider] OpenAI-compatible endpoint works!', data);
        return true;
      }

      return false;
    } catch (error) {
      console.log('❌ [OllamaProvider] OpenAI compatibility test failed:', error);
      return false;
    }
  }

  private getOllamaBaseURL(): string {
    // Use the Archestra proxy URL for Ollama
    return ARCHESTRA_SERVER_OLLAMA_PROXY_URL;
  }

  createModel(modelName: string) {
    console.log('🤖 [OllamaProvider] Creating model:', modelName);
    
    // Try the standard ollama-ai-provider first
    try {
      const model = this.ollama(modelName);

      // Log model instance details
      console.log('🔧 [OllamaProvider] Model instance created:', {
        modelName,
        modelType: typeof model,
        hasDoStream: 'doStream' in model,
        hasDoGenerate: 'doGenerate' in model,
        provider: model?.provider,
        modelId: model?.modelId,
        allKeys: model ? Object.keys(model) : [],
        prototypeKeys: model ? Object.getOwnPropertyNames(Object.getPrototypeOf(model)) : [],
      });

      // Test if this is a proper LanguageModelV1
      if (model && typeof model.doGenerate === 'function') {
        console.log('✅ [OllamaProvider] Model has doGenerate method');
      } else {
        console.error('❌ [OllamaProvider] Model missing doGenerate method!');
        // Fall back to custom implementation
        return this.createCustomOllamaModel(modelName);
      }

      if (model && typeof model.doStream === 'function') {
        console.log('✅ [OllamaProvider] Model has doStream method');

        // Wrap doStream to add debugging and fix compatibility issues
        const originalDoStream = model.doStream.bind(model);
        model.doStream = async (options: any) => {
          console.log('🌊 [OllamaProvider] doStream called with options:', {
            mode: options?.mode?.type,
            hasTools: options?.mode?.tools?.length > 0,
            temperature: options?.temperature,
            responseFormat: options?.responseFormat,
            prompt: options?.prompt,
            promptLength: Array.isArray(options?.prompt) ? options.prompt.length : 0,
            firstMessage: Array.isArray(options?.prompt) && options.prompt.length > 0 ? options.prompt[0] : null,
          });

          // Ollama doesn't support responseFormat, so remove it
          if (options?.responseFormat) {
            console.log('🔧 [OllamaProvider] Removing responseFormat for Ollama compatibility');
            const { responseFormat, ...optionsWithoutFormat } = options;
            options = optionsWithoutFormat;
          }

          try {
            const result = await originalDoStream(options);
            console.log('📦 [OllamaProvider] doStream returned:', {
              hasStream: !!result?.stream,
              streamType: typeof result?.stream,
              streamConstructor: result?.stream?.constructor?.name,
              isReadableStream: result?.stream instanceof ReadableStream,
              resultKeys: result ? Object.keys(result) : [],
            });
            return result;
          } catch (error) {
            console.error('💥 [OllamaProvider] doStream error:', error);
            // If ollama-ai-provider fails, try custom implementation
            if (error instanceof Error && (error.message.includes('404') || error.message.includes('Not Found'))) {
              console.log('🔄 [OllamaProvider] Falling back to custom Ollama implementation');
              const customModel = this.createCustomOllamaModel(modelName);
              return customModel.doStream(options);
            }
            throw error;
          }
        };

        // Also wrap doGenerate for consistency
        const originalDoGenerate = model.doGenerate.bind(model);
        model.doGenerate = async (options: any) => {
          console.log('🔄 [OllamaProvider] doGenerate called with options:', {
            mode: options?.mode?.type,
            hasTools: options?.mode?.tools?.length > 0,
            temperature: options?.temperature,
            responseFormat: options?.responseFormat,
          });

          // Ollama doesn't support responseFormat, so remove it
          if (options?.responseFormat) {
            console.log('🔧 [OllamaProvider] Removing responseFormat for Ollama compatibility');
            const { responseFormat, ...optionsWithoutFormat } = options;
            options = optionsWithoutFormat;
          }

          try {
            const result = await originalDoGenerate(options);
            console.log('✅ [OllamaProvider] doGenerate succeeded');
            return result;
          } catch (error) {
            console.error('💥 [OllamaProvider] doGenerate error:', error);
            // If ollama-ai-provider fails, try custom implementation
            if (error instanceof Error && (error.message.includes('404') || error.message.includes('Not Found'))) {
              console.log('🔄 [OllamaProvider] Falling back to custom Ollama implementation');
              const customModel = this.createCustomOllamaModel(modelName);
              return customModel.doGenerate(options);
            }
            throw error;
          }
        };
      }

      return model;
    } catch (error) {
      console.error('❌ [OllamaProvider] Failed to create model with ollama-ai-provider:', error);
      // Fall back to custom implementation
      return this.createCustomOllamaModel(modelName);
    }
  }

  /**
   * Create a custom Ollama model that implements LanguageModelV1 interface
   * This bypasses the ollama-ai-provider and directly calls Ollama's API
   */
  private createCustomOllamaModel(modelName: string): LanguageModelV1 {
    const baseURL = this.getOllamaBaseURL();
    
    console.log('🛠️ [OllamaProvider] Creating custom Ollama model implementation');

    return {
      provider: 'ollama-custom',
      modelId: modelName,
      defaultObjectGenerationMode: 'json',
      supportsStructuredOutputs: false,

      async doGenerate(options: any): Promise<any> {
        console.log('🔄 [CustomOllama] doGenerate called');
        
        // Convert AI SDK format to Ollama format
        const messages = options.prompt.map((msg: any) => ({
          role: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content?.find((c: any) => c.type === 'text')?.text || ''
        }));

        const response = await fetch(`${baseURL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages,
            stream: false,
            options: {
              temperature: options.temperature || 0.7,
              top_p: options.topP,
              max_tokens: options.maxTokens,
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        return {
          finishReason: 'stop',
          usage: {
            promptTokens: data.prompt_eval_count || 0,
            completionTokens: data.eval_count || 0,
          },
          text: data.message?.content || '',
          toolCalls: [],
          warnings: [],
        };
      },

      async doStream(options: any): Promise<any> {
        console.log('🌊 [CustomOllama] doStream called');
        
        // Convert AI SDK format to Ollama format
        const messages = options.prompt.map((msg: any) => ({
          role: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content?.find((c: any) => c.type === 'text')?.text || ''
        }));

        const response = await fetch(`${baseURL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages,
            stream: true,
            options: {
              temperature: options.temperature || 0.7,
              top_p: options.topP,
              max_tokens: options.maxTokens,
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        // Create a transform stream that converts Ollama's format to AI SDK format
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        
        const stream = new ReadableStream<LanguageModelV1StreamPart>({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                  try {
                    const data = JSON.parse(line);
                    
                    if (data.message?.content) {
                      controller.enqueue({
                        type: 'text-delta',
                        textDelta: data.message.content,
                      });
                    }

                    if (data.done) {
                      controller.enqueue({
                        type: 'finish',
                        finishReason: 'stop',
                        usage: {
                          promptTokens: data.prompt_eval_count || 0,
                          completionTokens: data.eval_count || 0,
                        },
                      });
                    }
                  } catch (e) {
                    console.error('Failed to parse Ollama response line:', line, e);
                  }
                }
              }
            } catch (error) {
              controller.error(error);
            } finally {
              controller.close();
            }
          },
        });

        return {
          stream,
          warnings: [],
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      },
    } as LanguageModelV1;
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
