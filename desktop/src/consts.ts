import { Bot, Download, MessageCircle, Settings } from 'lucide-react';

import { NavigationItem } from './types';

const ARCHESTRA_SERVER_BASE_URL = 'http://localhost:54587';

export const ARCHESTRA_SERVER_MCP_URL = `${ARCHESTRA_SERVER_BASE_URL}/mcp`;
export const ARCHESTRA_SERVER_MCP_PROXY_URL = `${ARCHESTRA_SERVER_BASE_URL}/mcp_proxy`;
export const ARCHESTRA_SERVER_API_URL = `${ARCHESTRA_SERVER_BASE_URL}/api`;

const ARCHESTRA_SERVER_LLM_PROXY_BASE_URL = `${ARCHESTRA_SERVER_BASE_URL}/llm`;

export const ARCHESTRA_SERVER_OLLAMA_PROXY_URL = `${ARCHESTRA_SERVER_LLM_PROXY_BASE_URL}/ollama`;

export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    title: 'Chat',
    icon: MessageCircle,
    key: 'chat',
  },
  {
    title: 'LLM Providers',
    icon: Download,
    key: 'llm-providers',
  },
  {
    title: 'Connectors',
    icon: Bot,
    key: 'mcp',
  },
  {
    title: 'Settings',
    icon: Settings,
    key: 'settings',
  },
];
