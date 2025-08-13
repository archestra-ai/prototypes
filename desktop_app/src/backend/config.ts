import dotenv from 'dotenv';

dotenv.config();

const OLLAMA_SERVER_PORT = parseInt(process.env.ARCHESTRA_OLLAMA_SERVER_PORT || '54589', 10);

const DEBUG = !['production', 'prod'].includes(process.env.NODE_ENV?.toLowerCase() || '');

export default {
  debug: DEBUG,
  logLevel: process.env.LOG_LEVEL || (DEBUG ? 'debug' : 'info'),
  server: {
    http: {
      port: parseInt(process.env.ARCHESTRA_API_SERVER_PORT || '54587', 10),
      host: 'localhost',
    },
    websocket: {
      port: parseInt(process.env.ARCHESTRA_WEBSOCKET_SERVER_PORT || '54588', 10),
    },
  },
  ai: {
    defaultProvider: process.env.DEFAULT_AI_PROVIDER || 'openai',
    openaiApiKey: process.env.OPENAI_API_KEY,
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  },
  ollama: {
    server: {
      host: `http://localhost:${OLLAMA_SERVER_PORT}`,
      port: OLLAMA_SERVER_PORT,
    },
  },
  sandbox: {
    baseDockerImage:
      process.env.MCP_BASE_DOCKER_IMAGE ||
      'europe-west1-docker.pkg.dev/friendly-path-465518-r6/archestra-public/mcp-server-base:0.0.1',
    podman: {
      baseUrl: 'http://d/v5.0.0',
    },
  },
  logging: {
    mcpServerLogMaxSize: process.env.MCP_SERVER_LOG_MAX_SIZE || '5M', // Size before rotation (e.g., '5M', '100K', '1G')
    mcpServerLogMaxFiles: parseInt(process.env.MCP_SERVER_LOG_MAX_FILES || '2', 10), // Number of rotated files to keep
  },
};
