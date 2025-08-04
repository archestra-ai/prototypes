import dotenv from 'dotenv';
import { Bot, Download, MessageCircle, Settings } from 'lucide-react';

import { NavigationItem, NavigationViewKey } from '@types';

dotenv.config();

const ARCHESTRA_API_SERVER_PORT = parseInt(process.env.PORT || '3456', 10);
const ARCHESTRA_API_SERVER_HOST = process.env.HOST || '127.0.0.1';

const ARCHESTRA_SERVER_BASE_URL = `${ARCHESTRA_API_SERVER_HOST}:${ARCHESTRA_API_SERVER_PORT}`;
const ARCHESTRA_SERVER_BASE_HTTP_URL = `http://${ARCHESTRA_SERVER_BASE_URL}`;
const ARCHESTRA_SERVER_LLM_PROXY_BASE_URL = `${ARCHESTRA_SERVER_BASE_URL}/llm`;

export default {
  ai: {
    defaultProvider: process.env.DEFAULT_AI_PROVIDER || 'openai',
    openaiApiKey: process.env.OPENAI_API_KEY,
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  },
  archestra: {
    apiUrl: `${ARCHESTRA_SERVER_BASE_HTTP_URL}/api`,
    mcpUrl: `${ARCHESTRA_SERVER_BASE_HTTP_URL}/mcp`,
    mcpProxyUrl: `${ARCHESTRA_SERVER_BASE_HTTP_URL}/mcp_proxy`,
    ollamaProxyUrl: `${ARCHESTRA_SERVER_LLM_PROXY_BASE_URL}/ollama`,
    openaiProxyUrl: `${ARCHESTRA_SERVER_LLM_PROXY_BASE_URL}/openai`,
    websocketUrl: `ws://${ARCHESTRA_SERVER_BASE_URL}/ws`,
    server: {
      host: ARCHESTRA_API_SERVER_HOST,
      port: ARCHESTRA_API_SERVER_PORT,
      logger: {
        level: process.env.LOG_LEVEL || 'info',
      },
    },
  },
  ollama: {
    server: {
      host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    },
  },
  ui: {
    chat: {
      defaultTitle: 'New Chat',
    },
    navigation: [
      {
        title: 'Chat',
        icon: MessageCircle,
        key: NavigationViewKey.Chat,
      },
      {
        title: 'LLM Providers',
        icon: Download,
        key: NavigationViewKey.LLMProviders,
      },
      {
        title: 'Connectors',
        icon: Bot,
        key: NavigationViewKey.MCP,
      },
      {
        title: 'Settings',
        icon: Settings,
        key: NavigationViewKey.Settings,
      },
    ] as NavigationItem[],
  },
};
