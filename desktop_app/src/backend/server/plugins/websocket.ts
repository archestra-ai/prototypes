import fastifyWebsocket from '@fastify/websocket';
import { FastifyPluginAsync } from 'fastify';

import { websocketService } from '@backend/services/websocket-service';

/**
 * WebSocket plugin for real-time communication
 *
 * This plugin adds WebSocket support to Fastify, enabling real-time
 * bidirectional communication between the server and clients.
 * Used for broadcasting chat updates and other real-time events.
 */
const websocketPlugin: FastifyPluginAsync = async (fastify) => {
  // Register the WebSocket plugin
  await fastify.register(fastifyWebsocket);

  // Initialize the WebSocket service with the Fastify instance
  websocketService.initialize(fastify);

  // Add WebSocket route
  fastify.get('/ws', { websocket: true }, async (socket, req) => {
    console.log('WebSocket client connected');

    // Add this connection to the service
    websocketService.addConnection(socket);

    // Handle incoming messages
    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Received WebSocket message:', data);

        // Echo back for now (can be extended to handle different message types)
        socket.send(
          JSON.stringify({
            type: 'echo',
            payload: data,
          })
        );
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    });

    // Handle connection close
    socket.on('close', () => {
      console.log('WebSocket client disconnected');
      websocketService.removeConnection(socket);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
};

export default websocketPlugin;
