import { FastifyPluginAsync } from 'fastify';
import fastifyCors from '@fastify/cors';

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCors, {
    // You can customize CORS options here
    origin: true, // Allow all origins in development
    credentials: true,
  });
};

export default corsPlugin;