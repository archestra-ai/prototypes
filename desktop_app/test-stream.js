const { createOllama } = require('ollama-ai-provider-v2');
const { streamText } = require('ai');

async function test() {
  const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:59630';

  console.log('Testing Ollama stream with host:', OLLAMA_HOST);

  const ollamaProvider = createOllama({
    baseURL: OLLAMA_HOST + '/api',
  });

  try {
    const result = streamText({
      model: ollamaProvider('qwen3:8b'),
      messages: [{ role: 'user', content: 'Say hello' }],
      providerOptions: {
        ollama: {
          think: false,
        },
      },
    });

    const response = result.toUIMessageStreamResponse({
      originalMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'Say hello' }],
        },
      ],
    });

    console.log('Response type:', typeof response);
    console.log('Response constructor:', response.constructor.name);

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let count = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        console.log(`Chunk ${++count}:`, chunk);
      }
    }

    console.log('Stream completed');
  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
  }
}

test();
