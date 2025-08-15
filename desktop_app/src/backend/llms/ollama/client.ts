import config from '@backend/config';
import log from '@backend/utils/logger';

interface GenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  format?: 'json' | undefined;
}

interface ChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

class OllamaClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.ollama.server.host;
  }

  /**
   * Generate a completion from a prompt
   */
  async generate(prompt: string, model: string = config.ai.ollamaModel): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate: ${response.statusText}`);
      }

      const data: GenerateResponse = await response.json();
      return data.response;
    } catch (error) {
      log.error('Failed to generate completion:', error);
      throw error;
    }
  }

  /**
   * Chat with a model
   */
  async chat(messages: ChatMessage[], model: string = config.ai.ollamaModel, format?: 'json'): Promise<string> {
    try {
      const request: ChatRequest = {
        model,
        messages,
        stream: false,
        format,
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Failed to chat: ${response.statusText}`);
      }

      const data: ChatResponse = await response.json();
      return data.message.content;
    } catch (error) {
      log.error('Failed to chat:', error);
      throw error;
    }
  }

  /**
   * Pull a model
   */
  async pull(modelName: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName, stream: false }),
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.statusText}`);
      }

      log.info(`Successfully pulled model ${modelName}`);
    } catch (error) {
      log.error(`Failed to pull model ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Generate a chat title based on messages
   */
  async generateChatTitle(messages: ChatMessage[]): Promise<string> {
    try {
      const prompt = `Based on the following conversation, generate a concise and descriptive title (max 5 words) that captures the main topic:

${messages.map((m) => `${m.role}: ${m.content}`).join('\n')}

Title:`;

      const title = await this.generate(prompt, config.ai.ollamaModel);
      // Clean up the title - remove quotes, trim whitespace
      return title.replace(/['"]/g, '').trim();
    } catch (error) {
      log.error('Failed to generate chat title:', error);
      throw error;
    }
  }
}

export default new OllamaClient();
