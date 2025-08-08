import { Bot, Download, MessageCircle, Settings } from 'lucide-react';

import { NavigationItem, NavigationViewKey } from '@ui/types';

// Frontend configuration using Vite's environment variables
// These values can be overridden by VITE_* prefixed environment variables
const ARCHESTRA_API_SERVER_HOST = import.meta.env.VITE_HOST || '127.0.0.1';
const ARCHESTRA_API_SERVER_PORT = import.meta.env.VITE_PORT || '3456';
const ARCHESTRA_WEBSOCKET_SERVER_PORT = import.meta.env.VITE_WEBSOCKET_PORT || '3457';

const ARCHESTRA_SERVER_BASE_URL = `${ARCHESTRA_API_SERVER_HOST}:${ARCHESTRA_API_SERVER_PORT}`;
const ARCHESTRA_SERVER_BASE_HTTP_URL = `http://${ARCHESTRA_SERVER_BASE_URL}`;
const ARCHESTRA_SERVER_LLM_PROXY_BASE_URL = `${ARCHESTRA_SERVER_BASE_URL}/llm`;

export default {
  archestra: {
    apiUrl: `${ARCHESTRA_SERVER_BASE_HTTP_URL}/api`,
    mcpUrl: `${ARCHESTRA_SERVER_BASE_HTTP_URL}/mcp`,
    ollamaProxyUrl: `${ARCHESTRA_SERVER_LLM_PROXY_BASE_URL}/ollama`,
    openaiProxyUrl: `${ARCHESTRA_SERVER_LLM_PROXY_BASE_URL}/openai`,
    websocketUrl: `ws://${ARCHESTRA_API_SERVER_HOST}:${ARCHESTRA_WEBSOCKET_SERVER_PORT}`,
  },
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
};
