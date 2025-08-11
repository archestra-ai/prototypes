# Tool calling not working with ollama-ai-provider-v2

Hi! First, thank you for creating this provider - it's been really helpful for integrating Ollama with Vercel AI SDK.

I'm having trouble getting tool calling to work. The Ollama API returns tool calls correctly, but they don't seem to be parsed by the provider.

## Test Code

```typescript
import { streamText, tool } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';
import { z } from 'zod';

const ollama = createOllama({ baseURL: 'http://localhost:11434/api' });

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
```

## What happens

The model responds with empty text, no tool calls detected.

## Direct Ollama API (works)

```bash
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3:8b",
    "messages": [{"role": "user", "content": "What is the weather in San Francisco?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string"}
          }
        }
      }
    }],
    "stream": false
  }'
```

Returns:

```json
{
  "message": {
    "role": "assistant",
    "content": "<think>\nUser asking about weather...\n</think>\n\n",
    "tool_calls": [
      {
        "function": {
          "name": "get_weather",
          "arguments": {
            "location": "San Francisco"
          }
        }
      }
    ]
  }
}
```

With streaming (`"stream": true`), the tool_calls appear in a chunk near the end:

```json
{
  "message": {
    "tool_calls": [{ "function": { "name": "get_weather", "arguments": { "location": "San Francisco" } } }]
  },
  "done": false
}
```

Is tool calling supported? If so, any tips on getting it to work? Thanks!
