import { Bot, Download, MessageCircle, Settings } from 'lucide-react';

import { NavigationItem, NavigationViewKey } from '@ui/types';

const HOST = import.meta.env.VITE_HOST || 'localhost';

// NOTE: 5173 is the default port for Vite's dev server
const PORT = import.meta.env.VITE_PORT || '5173';

const BASE_URL = `${HOST}:${PORT}`;

export default {
  archestra: {
    apiUrl: `${BASE_URL}/api`,
    /**
     * NOTE: for mcpUrl and mcpProxyUrl, we NEED to have the protocol specified, otherwise you'll see this
     * (on the browser side of things):
     *
     * Fetch API cannot load localhost:5173/mcp. URL scheme "localhost" is not supported.
     *
     */
    mcpUrl: `http://${BASE_URL}/mcp`,
    mcpProxyUrl: `http://${BASE_URL}/mcp_proxy`,
    ollamaProxyUrl: `${BASE_URL}/llm/ollama`,
    openaiProxyUrl: `${BASE_URL}/llm/openai`,
    websocketUrl: `ws://${BASE_URL}/ws`,
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
