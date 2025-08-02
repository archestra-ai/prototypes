import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText } from 'ai';
import fastifyCors from '@fastify/cors';
import dotenv from 'dotenv';
import fastify from 'fastify';
import { ollama } from 'ollama-ai-provider';

dotenv.config();

const app = fastify();

// Register CORS plugin
await app.register(fastifyCors);

app.post('/api/chat', async (request, reply) => {
  const { messages, provider = 'openai' } = request.body as any;

  const model = provider === "ollama" ? ollama("llama3.2") : openai("gpt-4o");
  
  console.log("Received message", messages);

  const result = streamText({
    model,
    messages: convertToModelMessages(messages),
  });

  // Convert Fastify's Reply to a Response-like object for compatibility with AI SDK
  const response = {
    headers: {
      set: (name: string, value: string) => reply.header(name, value),
    },
    write: (chunk: any) => reply.raw.write(chunk),
    end: () => reply.raw.end(),
  };

  // Set raw mode for streaming
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  result.toUIMessageStreamResponse(response as any);
  
  return reply;
});

const PORT = 3456;

// Start server on static port
try {
  await app.listen({ port: PORT, host: '127.0.0.1' });
  console.log(`Fastify server running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Handle graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutdown signal received, closing server...');
  await app.close();
  console.log('Server closed');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
