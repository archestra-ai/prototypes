import { convertToModelMessages, streamText } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';

async function main() {
  const ollama = createOllama({ baseURL: 'http://localhost:64609/api' });

  const result = streamText({
    model: ollama('qwen3:8b'),
    messages: [{ role: 'user', content: 'Tell me a joke' }],
  });

  for await (const chunk of result.fullStream) {
    console.log(chunk);
  }
}

main();
