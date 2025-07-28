import { Bot, Download, MessageCircle, Settings } from 'lucide-react';

import { NavigationItem, NavigationViewKey } from './types';

const ARCHESTRA_SERVER_BASE_URL = 'localhost:54587';
const ARCHESTRA_SERVER_BASE_HTTP_URL = `http://${ARCHESTRA_SERVER_BASE_URL}`;
const ARCHESTRA_SERVER_BASE_WEBSOCKET_URL = `ws://${ARCHESTRA_SERVER_BASE_URL}`;

export const ARCHESTRA_SERVER_MCP_URL = `${ARCHESTRA_SERVER_BASE_HTTP_URL}/mcp`;
export const ARCHESTRA_SERVER_MCP_PROXY_URL = `${ARCHESTRA_SERVER_BASE_HTTP_URL}/mcp_proxy`;
export const ARCHESTRA_SERVER_API_URL = `${ARCHESTRA_SERVER_BASE_HTTP_URL}/api`;
export const ARCHESTRA_SERVER_WEBSOCKET_URL = `${ARCHESTRA_SERVER_BASE_WEBSOCKET_URL}/ws`;

const ARCHESTRA_SERVER_LLM_PROXY_BASE_URL = `${ARCHESTRA_SERVER_BASE_HTTP_URL}/llm`;

export const ARCHESTRA_SERVER_OLLAMA_PROXY_URL = `${ARCHESTRA_SERVER_LLM_PROXY_BASE_URL}/ollama`;

export const NAVIGATION_ITEMS: NavigationItem[] = [
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
];

export const DEFAULT_CHAT_TITLE = 'New Chat';
