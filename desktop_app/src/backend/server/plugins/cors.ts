import fastifyCors from '@fastify/cors';
import { FastifyPluginAsync } from 'fastify';

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCors, {
    // Allow all origins in development
    origin: true,
    credentials: true,
    // Ensure all methods are allowed
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    // Allow common headers
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    // Expose headers that might be needed
    exposedHeaders: ['X-Total-Count'],
    // Cache preflight response for 1 hour
    maxAge: 3600,
  });
};

export default corsPlugin;
