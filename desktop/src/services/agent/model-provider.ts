import { openai } from '@ai-sdk/openai';
import { LanguageModelV2, LanguageModelV2StreamPart } from '@ai-sdk/provider';
import { createOllama } from 'ollama-ai-provider';
import { Ollama } from 'ollama/browser';

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
      const [resource] = args;

      try {
        const response = await originalFetch(...args);

        // Log response status
        if (typeof resource === 'string' && resource.includes('localhost')) {
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
    // ollama-ai-provider will append /chat to the base URL
    // Our proxy expects: http://localhost:54587/llm/ollama/api/chat
    // So we return: http://localhost:54587/llm/ollama/api
    return ARCHESTRA_SERVER_OLLAMA_PROXY_URL + '/api';
  }

  createModel(modelName: string) {
    console.log('🤖 [OllamaProvider] Creating model:', modelName);

    try {
      // Create a custom ollama instance with the proxy URL
      const baseURL = this.getOllamaBaseURL();
      console.log('🔗 [OllamaProvider] Using base URL:', baseURL);

      const ollama = createOllama({
        baseURL: baseURL,
      });

      // Create the model using the custom ollama instance
      const model = ollama(modelName);

      console.log('✅ [OllamaProvider] Model created with ollama-ai-provider:', {
        modelName,
        baseURL,
        provider: model?.provider,
        modelId: model?.modelId,
      });

      return model;
    } catch (error) {
      console.error('❌ [OllamaProvider] Failed to create model with ollama-ai-provider:', error);
      // Fall back to custom implementation
      console.log('🔄 [OllamaProvider] Falling back to custom Ollama implementation');
      return this.createCustomOllamaModel(modelName);
    }
  }

  /**
   * Create a custom Ollama model that implements LanguageModelV1 interface
   * This bypasses the ollama-ai-provider and directly calls Ollama's API
   */
  private createCustomOllamaModel(modelName: string): LanguageModelV2 {
    const baseURL = this.getOllamaBaseURL();

    console.log('🛠️ [OllamaProvider] Creating custom Ollama model implementation');

    // Create Ollama client instance
    const ollamaClient = new Ollama({ host: baseURL });

    // Store supportsTools result to avoid context issues
    const modelSupportsTools = this.supportsTools();

    return {
      specificationVersion: 'v2' as const,
      provider: 'ollama-custom',
      modelId: modelName,
      defaultObjectGenerationMode: 'tool' as const,
      supportedUrls: {},

      async doGenerate(options: any): Promise<any> {
        console.log('🔄 [CustomOllama] doGenerate called with options:', {
          mode: options?.mode,
          hasTools: options?.mode?.tools?.length > 0,
          toolsCount: options?.mode?.tools?.length || 0,
        });

        // Extract tools from options if available
        const tools = options?.mode?.tools || [];

        // Convert AI SDK format to Ollama format
        const messages = options.prompt.map((msg: any) => {
          let content = '';

          // Handle different content formats
          if (typeof msg.content === 'string') {
            content = msg.content;
          } else if (Array.isArray(msg.content)) {
            // If content is an array, find the text content
            const textContent = msg.content.find((c: any) => c.type === 'text');
            content = textContent?.text || '';
          } else if (msg.content && typeof msg.content === 'object' && msg.content.text) {
            // If content is an object with text property
            content = msg.content.text;
          }

          return {
            role: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'assistant',
            content,
          };
        });

        console.log('📤 [CustomOllama] Using Ollama client to chat');
        console.log('📦 [CustomOllama] Messages:', messages);

        try {
          let response: any;
          let lastError: any;
          const maxRetries = 3;

          for (let i = 0; i < maxRetries; i++) {
            try {
              // Convert AI SDK tools to Ollama format if model supports tools
              const ollamaTools =
                modelSupportsTools && tools.length > 0
                  ? tools.map((tool: any) => ({
                      type: 'function',
                      function: {
                        name: tool.name,
                        description: tool.description || 'No description provided',
                        parameters: tool.parameters || {},
                      },
                    }))
                  : [];

              console.log('🔧 [CustomOllama] Calling Ollama with tools:', {
                toolsCount: ollamaTools.length,
                modelSupportsTools: modelSupportsTools,
                tools: ollamaTools.map((t: any) => t.function.name),
              });

              response = await ollamaClient.chat({
                model: modelName,
                messages,
                stream: false,
                ...(ollamaTools.length > 0 ? { tools: ollamaTools } : {}),
                options: {
                  temperature: options.temperature || 0.7,
                  top_p: options.topP || 0.95,
                  num_predict: options.maxOutputTokens || 2048,
                },
              });
              break; // Success, exit retry loop
            } catch (error: any) {
              lastError = error;
              console.log(`🔄 [CustomOllama] Retry attempt ${i + 1}/${maxRetries} after error:`, error.message);

              // Check if it's a connection error that might resolve
              if (
                error.message?.includes('502') ||
                error.message?.includes('Bad Gateway') ||
                error.message?.includes('error sending request')
              ) {
                // Wait a bit before retrying (exponential backoff)
                await new Promise((resolve) => setTimeout(resolve, (i + 1) * 1000));
              } else {
                // If it's not a connection error, don't retry
                throw error;
              }
            }
          }

          if (!response) {
            throw lastError || new Error('Failed to get response from Ollama');
          }

          console.log('✅ [CustomOllama] Got response:', response);

          // Handle tool calls if present
          const toolCalls =
            response.message?.tool_calls?.map((tc: any) => ({
              type: 'function' as const,
              id: tc.id || crypto.randomUUID(),
              function: {
                name: tc.function?.name || '',
                arguments: JSON.stringify(tc.function?.arguments || {}),
              },
            })) || [];

          return {
            finishReason: 'stop',
            usage: {
              inputTokens: response.prompt_eval_count || 0,
              outputTokens: response.eval_count || 0,
              totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
            },
            text: response.message?.content || '',
            toolCalls,
            warnings: [],
          };
        } catch (error) {
          console.error('❌ [CustomOllama] Chat error:', error);
          throw error;
        }
      },

      async doStream(options: any): Promise<any> {
        console.log('🌊 [CustomOllama] doStream called with options:', {
          mode: options?.mode,
          hasTools: options?.mode?.tools?.length > 0,
          toolsCount: options?.mode?.tools?.length || 0,
          temperature: options?.temperature,
        });

        // Extract tools from options if available
        const tools = options?.mode?.tools || [];

        // Convert AI SDK format to Ollama format
        const messages = options.prompt.map((msg: any) => {
          let content = '';

          // Handle different content formats
          if (typeof msg.content === 'string') {
            content = msg.content;
          } else if (Array.isArray(msg.content)) {
            // If content is an array, find the text content
            const textContent = msg.content.find((c: any) => c.type === 'text');
            content = textContent?.text || '';
          } else if (msg.content && typeof msg.content === 'object' && msg.content.text) {
            // If content is an object with text property
            content = msg.content.text;
          }

          return {
            role: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'assistant',
            content,
          };
        });

        console.log('📤 [CustomOllama] Using Ollama client to stream');
        console.log('📦 [CustomOllama] Messages:', messages);

        try {
          // Get the streaming response from Ollama with retry logic
          let response: any;
          let lastError: any;
          const maxRetries = 3;

          for (let i = 0; i < maxRetries; i++) {
            try {
              // Convert AI SDK tools to Ollama format if model supports tools
              const ollamaTools =
                modelSupportsTools && tools.length > 0
                  ? tools.map((tool: any) => ({
                      type: 'function',
                      function: {
                        name: tool.name,
                        description: tool.description || 'No description provided',
                        parameters: tool.parameters || {},
                      },
                    }))
                  : [];

              console.log('🔧 [CustomOllama] Calling Ollama with tools:', {
                toolsCount: ollamaTools.length,
                modelSupportsTools: modelSupportsTools,
                tools: ollamaTools.map((t: any) => t.function.name),
              });

              response = await ollamaClient.chat({
                model: modelName,
                messages,
                stream: true,
                ...(ollamaTools.length > 0 ? { tools: ollamaTools } : {}),
                options: {
                  temperature: options.temperature || 0.7,
                  top_p: options.topP || 0.95,
                  num_predict: options.maxOutputTokens || 2048,
                },
              });
              break; // Success, exit retry loop
            } catch (error: any) {
              lastError = error;
              console.log(`🔄 [CustomOllama] Retry attempt ${i + 1}/${maxRetries} after error:`, error.message);

              // Check if it's a connection error that might resolve
              if (
                error.message?.includes('502') ||
                error.message?.includes('Bad Gateway') ||
                error.message?.includes('error sending request')
              ) {
                // Wait a bit before retrying (exponential backoff)
                await new Promise((resolve) => setTimeout(resolve, (i + 1) * 1000));
              } else {
                // If it's not a connection error, don't retry
                throw error;
              }
            }
          }

          if (!response) {
            throw lastError || new Error('Failed to get streaming response from Ollama');
          }

          // Create a transform stream that converts Ollama's format to AI SDK format
          const stream = new ReadableStream<LanguageModelV2StreamPart>({
            async start(controller) {
              try {
                for await (const part of response) {
                  // console.log('🔄 [CustomOllama] Stream part:', part);

                  // Handle regular text content
                  if (part.message?.content) {
                    controller.enqueue({
                      type: 'text-delta',
                      id: crypto.randomUUID(),
                      delta: part.message.content,
                    });
                  }

                  // Handle tool calls
                  if (part.message?.tool_calls) {
                    console.log(
                      '🛠️ [CustomOllama] Tool calls detected:',
                      JSON.stringify(part.message.tool_calls, null, 2)
                    );
                    for (const toolCall of part.message.tool_calls) {
                      // Extract tool information with better logging
                      const toolName = toolCall.function?.name || toolCall.name || '';
                      const toolArgs = toolCall.function?.arguments || toolCall.arguments || {};
                      const toolId = toolCall.id || toolCall.function?.id || crypto.randomUUID();

                      console.log('📞 [CustomOllama] Enqueuing tool call:', {
                        toolName,
                        toolId,
                        args: toolArgs,
                        originalToolCall: toolCall,
                      });

                      controller.enqueue({
                        type: 'tool-call',
                        toolCallType: 'function',
                        toolCallId: toolId,
                        toolName: toolName,
                        args: toolArgs,
                      } as any);
                    }
                  }

                  if (part.done) {
                    controller.enqueue({
                      type: 'finish',
                      finishReason: 'stop',
                      usage: {
                        inputTokens: part.prompt_eval_count || 0,
                        outputTokens: part.eval_count || 0,
                        totalTokens: (part.prompt_eval_count || 0) + (part.eval_count || 0),
                      },
                    });
                  }
                }
              } catch (error) {
                console.error('❌ [CustomOllama] Stream error:', error);
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
        } catch (error) {
          console.error('❌ [CustomOllama] Stream chat error:', error);
          throw error;
        }
      },
    } as LanguageModelV2;
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
