const HOST = import.meta.env.VITE_HOST || 'localhost';

// NOTE: 5173 is the default port for Vite's dev server
const PORT = import.meta.env.VITE_PORT || '5173';

const BASE_URL = `${HOST}:${PORT}`;
const BASE_URL_WITH_PROTOCOL = `http://${BASE_URL}`;

export default {
  debug: !['production', 'prod'].includes(process.env.NODE_ENV?.toLowerCase() || ''),
  archestra: {
    apiUrl: BASE_URL_WITH_PROTOCOL,
    mcpUrl: `${BASE_URL_WITH_PROTOCOL}/mcp`,
    chatStreamBaseUrl: `${BASE_URL_WITH_PROTOCOL}/api/llm`,
    ollamaProxyUrl: `${BASE_URL}/llm/ollama`,
    websocketUrl: `ws://${BASE_URL}/ws`,
    catalogUrl: 'https://www.archestra.ai/mcp-catalog/api',
  },
  chat: {
    defaultTitle: 'New Chat',
  },
};
