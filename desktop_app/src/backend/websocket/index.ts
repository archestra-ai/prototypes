import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';

import config from '@backend/config';
import { ToolAnalysisResultSchema, ToolMetadataSchema } from '@backend/database/schema/tool';
import McpServerSandboxManager, { SandboxStatusSummarySchema } from '@backend/sandbox/manager';
import log from '@backend/utils/logger';

const ChatTitleUpdatedPayloadSchema = z.object({
  chatId: z.number(),
  title: z.string(),
});

const ToolsAnalyzedPayloadSchema = z.object({
  mcpServerId: z.string(),
  tools: z.array(
    z.object({
      name: z.string(),
      metadata: ToolMetadataSchema,
      analysis: ToolAnalysisResultSchema.nullable(),
    })
  ),
});

export const WebSocketMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chat-title-updated'), payload: ChatTitleUpdatedPayloadSchema }),
  z.object({ type: z.literal('sandbox-status-update'), payload: SandboxStatusSummarySchema }),
  z.object({ type: z.literal('tools-analyzed'), payload: ToolsAnalyzedPayloadSchema }),
]);

// type ChatTitleUpdatedPayload = z.infer<typeof ChatTitleUpdatedPayloadSchema>;
type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private sandboxStatusInterval: NodeJS.Timeout | null = null;

  start() {
    const { port } = config.server.websocket;

    this.wss = new WebSocketServer({ port });

    log.info(`WebSocket server started on port ${port}`);

    this.wss.on('connection', (ws: WebSocket) => {
      log.info(`WebSocket client connected. Total connections: ${this.wss?.clients.size}`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          log.info('Received WebSocket message:', message);
        } catch (error) {
          log.error('Failed to parse WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        log.info(`WebSocket client disconnected. Remaining connections: ${this.wss?.clients.size}`);
      });

      ws.on('error', (error) => {
        log.error('WebSocket error:', error);
      });
    });

    this.wss.on('error', (error) => {
      log.error('WebSocket server error:', error);
    });

    this.periodicallyEmitSandboxStatusSummaryUpdates();
  }

  broadcast(message: WebSocketMessage) {
    if (!this.wss) {
      log.warn('WebSocket server not initialized');
      return;
    }

    const messageStr = JSON.stringify(message);
    const clientCount = this.wss.clients.size;

    let sentCount = 0;
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
        sentCount++;
      }
    });

    if (sentCount < clientCount) {
      log.info(`Only sent to ${sentCount}/${clientCount} clients (some were not ready)`);
    }
  }

  stop() {
    // Clear the interval first
    if (this.sandboxStatusInterval) {
      clearInterval(this.sandboxStatusInterval);
      this.sandboxStatusInterval = null;
      log.info('Cleared sandbox status interval');
    }

    // Close all client connections
    if (this.wss) {
      this.wss.clients.forEach((client) => {
        client.close();
      });

      this.wss.close(() => {
        log.info('WebSocket server closed');
      });
      this.wss = null;
    }
  }

  private periodicallyEmitSandboxStatusSummaryUpdates() {
    this.sandboxStatusInterval = setInterval(() => {
      this.broadcast({ type: 'sandbox-status-update', payload: McpServerSandboxManager.statusSummary });
    }, 1000);
  }
}

export default new WebSocketService();
