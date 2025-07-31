import express from 'express';
import cors from 'cors';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
let server: any;

app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const result = streamText({
    model: openai('gpt-4-turbo'),
    messages: req.body.messages,
  });

  for await (const chunk of result.baseStream) {
    if (chunk?.part?.text) {
      res.write(chunk.part.text);
    }
  }
  res.end();
});

export async function startServer() {
  return new Promise<number>((resolve) => {
    server = app.listen(3000, '127.0.0.1', () => {
      resolve(3000);
    });
  });
}

export function stopServer() {
  return new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
}