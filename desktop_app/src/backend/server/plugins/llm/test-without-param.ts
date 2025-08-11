import { streamText, tool } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';
import { z } from 'zod';

async function main() {
  const ollama = createOllama({ baseURL: 'http://localhost:50661/api' });

  console.log('TEST: Tool WITHOUT parameters (empty object)\n');

  const result = streamText({
    model: ollama('qwen3:8b'),
    messages: [{ role: 'user', content: 'Show me the environment variables using printEnv' }],
    tools: {
      printEnv: tool({
        description: 'Prints all environment variables',
        parameters: z.object({}), // Empty parameters, just like MCP tool
        execute: async () => {
          console.log('\n>>> printEnv called (no parameters)');
          return 'Environment variables printed';
        },
      }),
    },
    toolChoice: 'required',
  });

  console.log('Streaming response...\n');

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'tool-call') {
      console.log('✅ TOOL CALLED:', chunk.toolName, 'with args:', chunk.args);
    } else if (chunk.type === 'text-delta') {
      process.stdout.write(chunk.textDelta);
    }
  }

  console.log('\n\nDone!');
}

main().catch(console.error);
