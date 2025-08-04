import { LucideIcon } from 'lucide-react';

export enum NavigationViewKey {
  Chat = 'chat',
  LLMProviders = 'llm-providers',
  MCP = 'mcp',
  Settings = 'settings',
}

export enum NavigationSubViewKey {
  Ollama = 'ollama',
}

export interface NavigationItem {
  title: string;
  icon: LucideIcon;
  key: NavigationViewKey;
}
