import dotenv from 'dotenv';

dotenv.config();

export default {
  server: {
    port: parseInt(process.env.PORT || '3456', 10),
    host: process.env.HOST || '127.0.0.1',
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  },
  ai: {
    defaultProvider: process.env.DEFAULT_AI_PROVIDER || 'openai',
    openaiApiKey: process.env.OPENAI_API_KEY,
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  },
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
  },
};
