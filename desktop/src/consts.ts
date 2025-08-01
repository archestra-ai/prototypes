import { Bot, Download, MessageCircle, Settings } from 'lucide-react';

import { NavigationItem, NavigationViewKey } from './types';

export const DEBUG = import.meta.env.DEV;

const ARCHESTRA_GATEWAY_SERVER_BASE_URL = import.meta.env.VITE_ARCHESTRA_GATEWAY_SERVER_BASE_URL;

export const ARCHESTRA_SERVER_MCP_URL = `${ARCHESTRA_GATEWAY_SERVER_BASE_URL}/mcp`;
export const ARCHESTRA_SERVER_MCP_PROXY_URL = `${ARCHESTRA_GATEWAY_SERVER_BASE_URL}/mcp_proxy`;
export const ARCHESTRA_SERVER_API_URL = `${ARCHESTRA_GATEWAY_SERVER_BASE_URL}/api`;
export const ARCHESTRA_SERVER_WEBSOCKET_URL = import.meta.env.VITE_ARCHESTRA_WEBSOCKET_SERVER_URL;

const ARCHESTRA_SERVER_LLM_PROXY_BASE_URL = `${ARCHESTRA_GATEWAY_SERVER_BASE_URL}/llm`;

export const ARCHESTRA_SERVER_OLLAMA_PROXY_URL = `${ARCHESTRA_SERVER_LLM_PROXY_BASE_URL}/ollama`;

console.log(
  'ARCHESTRA_GATEWAY_SERVER_BASE_URL',
  ARCHESTRA_GATEWAY_SERVER_BASE_URL,
  'ARCHESTRA_SERVER_MCP_URL',
  ARCHESTRA_SERVER_MCP_URL,
  'ARCHESTRA_SERVER_MCP_PROXY_URL',
  ARCHESTRA_SERVER_MCP_PROXY_URL,
  'ARCHESTRA_SERVER_API_URL',
  ARCHESTRA_SERVER_API_URL,
  'ARCHESTRA_SERVER_WEBSOCKET_URL',
  ARCHESTRA_SERVER_WEBSOCKET_URL,
  'ARCHESTRA_SERVER_OLLAMA_PROXY_URL',
  ARCHESTRA_SERVER_OLLAMA_PROXY_URL
);

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
