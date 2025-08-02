import { Settings } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@ui/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { AI_PROVIDERS } from '@ui/hooks/use-ai-chat';
import { type LLMProvider, useChatStore } from '@ui/stores/chat-store';

import { ApiKeyDialog } from './ApiKeyDialog';

// Map of LLMProvider values to AI provider keys
const PROVIDER_MAPPING: Record<string, keyof typeof AI_PROVIDERS | null> = {
  ollama: null, // Ollama doesn't use AI_PROVIDERS config
  chatgpt: 'openai',
  claude: 'anthropic',
};

export function ProviderSelector() {
  const { selectedProvider, setSelectedProvider, openaiApiKey, anthropicApiKey } = useChatStore();
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);

  const handleProviderChange = (value: LLMProvider) => {
    setSelectedProvider(value);
    if (value === 'chatgpt' && !openaiApiKey) {
      setShowApiKeyDialog(true);
    } else if (value === 'claude' && !anthropicApiKey) {
      setShowApiKeyDialog(true);
    }
  };

  const requiresApiKey = selectedProvider === 'chatgpt' || selectedProvider === 'claude';

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Provider:</span>
        <Select value={selectedProvider} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ollama">Ollama</SelectItem>
            {Object.entries(PROVIDER_MAPPING).map(([key, aiProviderKey]) => {
              if (key !== 'ollama' && aiProviderKey && AI_PROVIDERS[aiProviderKey]) {
                return (
                  <SelectItem key={key} value={key}>
                    {AI_PROVIDERS[aiProviderKey].name}
                  </SelectItem>
                );
              }
              return null;
            })}
          </SelectContent>
        </Select>
        {requiresApiKey && (
          <Button variant="ghost" size="icon" onClick={() => setShowApiKeyDialog(true)}>
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>
      <ApiKeyDialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog} />
    </>
  );
}
