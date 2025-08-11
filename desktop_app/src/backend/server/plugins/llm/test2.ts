import { streamText, tool } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';
import { z } from 'zod';

async function main() {
  const ollama = createOllama({ baseURL: 'http://localhost:50661/api' });

  const result = streamText({
    model: ollama('qwen3:8b'),
    messages: [{ role: 'user', content: 'What is the weather in San Francisco?' }],
    tools: {
      get_weather: tool({
        description: 'Get the current weather',
        parameters: z.object({
          location: z.string(),
        }),
        execute: async ({ location }) => ({ temp: 72, location }),
      }),
    },
  });

  for await (const chunk of result.fullStream) {
    console.log(chunk);
  }
}

main();
