import dotenv from 'dotenv';

dotenv.config();

const ARCHESTRA_API_SERVER_PORT = parseInt(process.env.PORT || '3456', 10);
const ARCHESTRA_API_SERVER_HOST = process.env.HOST || '127.0.0.1';

export default {
  server: {
    http: {
      port: ARCHESTRA_API_SERVER_PORT,
      host: ARCHESTRA_API_SERVER_HOST,
    },
    websocket: {
      port: parseInt(process.env.ARCHESTRA_WEBSOCKET_PORT || '3457', 10),
    },
  },
  ai: {
    defaultProvider: process.env.DEFAULT_AI_PROVIDER || 'openai',
    openaiApiKey: process.env.OPENAI_API_KEY,
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  },
  ollama: {
    server: {
      host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    },
  },
  sandbox: {
    baseDockerImage:
      process.env.MCP_BASE_DOCKER_IMAGE ||
      'europe-west1-docker.pkg.dev/friendly-path-465518-r6/archestra-public/mcp-server-base:0.0.1',
  },
  release: {
    repo: 'archestra-ai/archestra',
    updateInterval: '1 hour',
  },
};
