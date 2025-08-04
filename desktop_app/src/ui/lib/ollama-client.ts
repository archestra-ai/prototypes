import type { AbortableAsyncIterator, ChatRequest, ChatResponse, Config } from 'ollama/browser';
import { Ollama } from 'ollama/browser';

interface ArchestraOllamaRequest extends ChatRequest {
  session_id: string; // The backend ollama proxy expects session_id as part of the request body
}

export interface ArchestraOllamaStreamingChatRequest extends ArchestraOllamaRequest {
  stream: true;
}

export interface ArchestraOllamaNonStreamingChatRequest extends ArchestraOllamaRequest {
  stream?: false;
}

type ArchestraOllamaChatRequest = ArchestraOllamaStreamingChatRequest | ArchestraOllamaNonStreamingChatRequest;

export class ArchestraOllamaClient extends Ollama {
  constructor(config?: Partial<Config>) {
    super({
      ...(config ?? {}),
      host: config.archestra.ollamaProxyUrl,
    });
  }

  // Override the chat method to handle session_id
  async chat(request: ArchestraOllamaStreamingChatRequest): Promise<AbortableAsyncIterator<ChatResponse>>;
  async chat(request: ArchestraOllamaNonStreamingChatRequest): Promise<ChatResponse>;
  async chat(request: ArchestraOllamaChatRequest): Promise<ChatResponse | AbortableAsyncIterator<ChatResponse>> {
    if (request.stream === true) {
      return super.chat(request as ChatRequest & { stream: true });
    } else {
      return super.chat(request as ChatRequest & { stream?: false });
    }
  }
}
