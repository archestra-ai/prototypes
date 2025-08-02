import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText } from 'ai';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { ollama } from 'ollama-ai-provider';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { messages, provider = 'openai' } = req.body;

  const model = provider === 'ollama' ? ollama('llama3.2') : openai('gpt-4o');

  const result = streamText({
    model,
    messages: convertToModelMessages(messages),
  });

  result.toUIMessageStreamResponse(res);
});

const PORT = 3456;

// Start server on static port
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Express server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
