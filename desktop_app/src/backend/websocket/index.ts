import { WebSocket, WebSocketServer } from 'ws';

import config from '@backend/config';
import { WebSocketMessage } from '@backend/types';

class WebSocketService {
  private wss: WebSocketServer | null = null;

  start() {
    const { port } = config.server.websocket;

    this.wss = new WebSocketServer({ port });

    console.log(`WebSocket server started on port ${port}`);

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected');
      console.log('Total connections:', this.wss?.clients.size);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('Received WebSocket message:', message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        console.log('Remaining connections:', this.wss?.clients.size);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  broadcast(message: WebSocketMessage) {
    if (!this.wss) {
      console.warn('WebSocket server not initialized');
      return;
    }

    const messageStr = JSON.stringify(message);
    const clientCount = this.wss.clients.size;
    console.log(`Broadcasting WebSocket message: ${message.type} to ${clientCount} connections`);

    let sentCount = 0;
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
        sentCount++;
      }
    });

    if (sentCount < clientCount) {
      console.log(`Only sent to ${sentCount}/${clientCount} clients (some were not ready)`);
    }
  }

  stop() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      console.log('WebSocket server stopped');
    }
  }
}

export default new WebSocketService();
