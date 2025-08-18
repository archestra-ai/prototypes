import { z } from 'zod';

import config from '@backend/config';
import log from '@backend/utils/logger';
import WebSocketService from '@backend/websocket';

const OllamaGenerateRequestSchema = z.object({
  model: z.string(),
  prompt: z.string(),
  stream: z.boolean().optional().default(false),
  format: z.enum(['json']).optional(),
  options: z
    .object({
      temperature: z.number().optional(),
      top_k: z.number().optional(),
      top_p: z.number().optional(),
      num_predict: z.number().optional(),
      stop: z.array(z.string()).optional(),
    })
    .optional(),
});

const OllamaGenerateResponseSchema = z.object({
  model: z.string(),
  created_at: z.string(),
  response: z.string(),
  done: z.boolean(),
  context: z.array(z.number()).optional(),
  total_duration: z.number().optional(),
  load_duration: z.number().optional(),
  prompt_eval_count: z.number().optional(),
  prompt_eval_duration: z.number().optional(),
  eval_count: z.number().optional(),
  eval_duration: z.number().optional(),
});

const OllamaPullRequestSchema = z.object({
  name: z.string(),
  insecure: z.boolean().optional(),
  stream: z.boolean().optional(),
});

const OllamaPullResponseSchema = z.object({
  status: z.string(),
  digest: z.string().optional(),
  total: z.number().optional(),
  completed: z.number().optional(),
});

const OllamaListResponseSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      model: z.string(),
      modified_at: z.string(),
      size: z.number(),
      digest: z.string(),
      details: z
        .object({
          parent_model: z.string().optional(),
          format: z.string().optional(),
          family: z.string().optional(),
          families: z.array(z.string()).optional(),
          parameter_size: z.string().optional(),
          quantization_level: z.string().optional(),
        })
        .optional(),
    })
  ),
});

type OllamaGenerateRequest = z.infer<typeof OllamaGenerateRequestSchema>;
type OllamaGenerateResponse = z.infer<typeof OllamaGenerateResponseSchema>;
type OllamaPullRequest = z.infer<typeof OllamaPullRequestSchema>;
type OllamaPullResponse = z.infer<typeof OllamaPullResponseSchema>;
type OllamaListResponse = z.infer<typeof OllamaListResponseSchema>;

class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || config.ollama.server.host;
  }

  /**
   * Generate a completion from a model
   */
  async generate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Ollama generate failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return OllamaGenerateResponseSchema.parse(data);
    } catch (error) {
      log.error('Failed to generate completion:', error);
      throw error;
    }
  }

  /**
   * Pull a model from the Ollama library
   */
  async pull(request: OllamaPullRequest): Promise<void> {
    try {
      // Always use streaming to get progress updates
      const streamingRequest = { ...request, stream: true };

      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(streamingRequest),
      });

      if (!response.ok) {
        throw new Error(`Ollama pull failed: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      // Broadcast initial downloading status
      WebSocketService.broadcast({
        type: 'ollama-model-download-progress',
        payload: {
          model: request.name,
          status: 'downloading',
          progress: 0,
          message: 'Starting download',
        },
      });

      let lastBroadcastedProgress = 0;
      let lastStatus: 'downloading' | 'verifying' | 'completed' = 'downloading';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            const parsed = OllamaPullResponseSchema.parse(data);

            let status: 'downloading' | 'verifying' | 'completed' = 'downloading';
            let progress: number = 0;

            if (parsed.status === 'success') {
              status = 'completed';
              progress = 100;
            } else if (parsed.status.includes('verifying')) {
              status = 'verifying';
            } else if (parsed.total && parsed.completed) {
              progress = Math.round((parsed.completed / parsed.total) * 100);
            }

            /**
             * Only broadcast if we have a meaningful update:
             * - Status changed
             * - Progress increased by at least 1 integer percentage
             * - Completed
             */
            const shouldBroadcast =
              status !== lastStatus ||
              (progress !== undefined && progress > lastBroadcastedProgress) ||
              status === 'completed';

            if (shouldBroadcast) {
              WebSocketService.broadcast({
                type: 'ollama-model-download-progress',
                payload: {
                  model: request.name,
                  status,
                  progress,
                  message: parsed.status,
                },
              });

              if (progress !== undefined) {
                lastBroadcastedProgress = progress;
              }
              lastStatus = status;
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }

      // Ensure we broadcast completion
      WebSocketService.broadcast({
        type: 'ollama-model-download-progress',
        payload: {
          model: request.name,
          status: 'completed',
          progress: 100,
          message: 'Download complete!',
        },
      });
    } catch (error) {
      // Broadcast error status
      WebSocketService.broadcast({
        type: 'ollama-model-download-progress',
        payload: {
          model: request.name,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          progress: 0,
        },
      });

      log.error(`Failed to pull model ${request.name}:`, error);
      throw error;
    }
  }

  /**
   * List available models
   */
  async list(): Promise<OllamaListResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Ollama list failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return OllamaListResponseSchema.parse(data);
    } catch (error) {
      log.error('Failed to list models:', error);
      throw error;
    }
  }

  /**
   * Generate a chat title based on messages
   */
  async generateChatTitle(messages: string[]): Promise<string> {
    const prompt = `Generate a short, concise title (3-6 words) for a chat conversation that includes the following messages:

${messages.join('\n\n')}

The title should capture the main topic or theme of the conversation. Respond with ONLY the title, no quotes, no explanation.`;

    try {
      const response = await this.generate({
        model: config.ai.ollamaModel,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 20,
        },
      });

      return response.response.trim();
    } catch (error) {
      log.error('Failed to generate chat title:', error);
      throw error;
    }
  }

  /**
   * Wait for the Ollama server to be ready to accept requests
   */
  private async waitForServerReady(maxRetries = 30, retryDelay = 1000): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.list();
        log.info('Ollama server is ready');
        return;
      } catch (error) {
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }
    throw new Error('Ollama server failed to become ready after maximum retries');
  }

  /**
   * Ensure that required models are available, downloading them if necessary
   */
  async ensureModelsAvailable(): Promise<void> {
    // Wait for server to be ready
    await this.waitForServerReady();

    try {
      // Get list of installed models
      const { models: installedModels } = await this.list();
      const installedModelNames = installedModels.map((m) => m.name);

      // Find models that need to be downloaded
      const modelsToDownload = config.ollama.requiredModels.filter(
        ({ model: modelName }) => !installedModelNames.includes(modelName)
      );

      if (modelsToDownload.length === 0) {
        log.info('All required models are already available');
        return;
      }

      // Download all missing models in parallel
      log.info(`Downloading ${modelsToDownload.length} required models...`);

      const downloadPromises = modelsToDownload.map(async ({ model: modelName }) => {
        log.info(`Starting download for model '${modelName}'...`);
        try {
          await this.pull({ name: modelName });
          log.info(`Successfully downloaded model '${modelName}'`);
        } catch (error) {
          log.error(`Failed to download model '${modelName}':`, error);
          // Don't throw - allow other models to continue downloading
        }
      });

      // Wait for all downloads to complete
      await Promise.all(downloadPromises);

      log.info('Finished downloading required models');
    } catch (error) {
      log.error('Failed to ensure models are available:', error);
      // Don't throw here - server should still work even if models aren't downloaded
    }
  }
}

export default new OllamaClient();
