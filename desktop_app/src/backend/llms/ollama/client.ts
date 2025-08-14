import { z } from 'zod';

import config from '@backend/config';
import log from '@backend/utils/logger';

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
  stream: z.boolean().optional().default(true),
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

export class OllamaClient {
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
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Ollama pull failed: ${response.status} ${response.statusText}`);
      }

      // Handle streaming response
      if (request.stream) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No response body');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter((line) => line.trim());

          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              const parsed = OllamaPullResponseSchema.parse(data);

              if (parsed.total && parsed.completed) {
                const percentage = Math.round((parsed.completed / parsed.total) * 100);
                log.info(`Pulling ${request.name}: ${percentage}% (${parsed.status})`);
              } else {
                log.info(`Pulling ${request.name}: ${parsed.status}`);
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
      } else {
        await response.json();
      }
    } catch (error) {
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
}
