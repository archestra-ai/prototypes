import ReconnectingWebSocket from 'reconnecting-websocket';

import { ARCHESTRA_SERVER_WEBSOCKET_URL, DEBUG } from '@/consts';
import { WebSocketMessage } from '@/lib/api';

type MessageHandler<T extends WebSocketMessage = WebSocketMessage> = (message: T) => void;

type MessageTypeMap = {
  'chat-title-updated': Extract<WebSocketMessage, { type: 'chat-title-updated' }>;
  'oauth-success': Extract<WebSocketMessage, { type: 'oauth-success' }>;
  'oauth-error': Extract<WebSocketMessage, { type: 'oauth-error' }>;
};

class WebSocketService {
  private ws: ReconnectingWebSocket | null = null;
  private handlers: Map<WebSocketMessage['type'], Set<MessageHandler<any>>> = new Map();
  private connectionPromise: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      this.ws = new ReconnectingWebSocket(ARCHESTRA_SERVER_WEBSOCKET_URL, [], {
        WebSocket: window.WebSocket,
        maxReconnectionDelay: 10000,
        minReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1.3,
        connectionTimeout: 10000,
        maxRetries: Infinity,
        debug: DEBUG,
      });

      this.ws.addEventListener('open', () => {
        console.log('WebSocket connected');
        resolve();
      });

      this.ws.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        if (!this.ws) {
          reject(error);
        }
      });

      this.ws.addEventListener('message', (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });

      this.ws.addEventListener('close', () => {
        console.log('WebSocket disconnected');
      });
    });

    return this.connectionPromise;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connectionPromise = null;
    }
  }

  subscribe<T extends keyof MessageTypeMap>(type: T, handler: MessageHandler<MessageTypeMap[T]>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    this.handlers.get(type)!.add(handler as MessageHandler<any>);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        handlers.delete(handler as MessageHandler<any>);
        if (handlers.size === 0) {
          this.handlers.delete(type);
        }
      }
    };
  }

  private handleMessage(message: WebSocketMessage): void {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error('Error in WebSocket message handler:', error);
        }
      });
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Create singleton instance
export const websocketService = new WebSocketService();
