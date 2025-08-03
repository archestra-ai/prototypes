import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';

export interface WebSocketMessage {
  type: 'chat-title-updated' | 'echo';
  payload: any;
}

class WebSocketService {
  private fastify: FastifyInstance | null = null;
  private connections: Set<WebSocket> = new Set();

  initialize(fastifyInstance: FastifyInstance) {
    this.fastify = fastifyInstance;
  }

  addConnection(socket: WebSocket) {
    this.connections.add(socket);
    
    socket.on('close', () => {
      this.connections.delete(socket);
    });
  }

  removeConnection(socket: WebSocket) {
    this.connections.delete(socket);
  }

  broadcast(message: WebSocketMessage) {
    const messageStr = JSON.stringify(message);
    
    this.connections.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(messageStr);
      }
    });
  }

  broadcastChatTitleUpdate(chatId: number, title: string) {
    this.broadcast({
      type: 'chat-title-updated',
      payload: {
        chat_id: chatId,
        title,
      },
    });
  }
}

export const websocketService = new WebSocketService();