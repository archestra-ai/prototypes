import BinaryRunner from '@backend/lib/utils/binaries';

export default class OllamaServer extends BinaryRunner {
  constructor(port: number) {
    super('Ollama server', 'ollama-v0.9.6', ['serve'], {
      HOME: process.env.HOME,
      OLLAMA_HOST: `127.0.0.1:${port}`,
      OLLAMA_ORIGINS: 'http://localhost:54587',
      OLLAMA_DEBUG: '0',
    });
  }
}
