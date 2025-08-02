import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AI_PROVIDERS } from '@/hooks/use-ai-chat';
import { useChatStore } from '@/stores/chat-store';

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApiKeyDialog({ open, onOpenChange }: ApiKeyDialogProps) {
  const { selectedProvider, openaiApiKey, anthropicApiKey, setOpenAIApiKey, setAnthropicApiKey } = useChatStore();
  const currentApiKey = selectedProvider === 'chatgpt' ? openaiApiKey : anthropicApiKey;
  const [apiKey, setApiKey] = useState(currentApiKey || '');

  const handleSave = () => {
    if (selectedProvider === 'chatgpt') {
      setOpenAIApiKey(apiKey);
    } else if (selectedProvider === 'claude') {
      setAnthropicApiKey(apiKey);
    }
    onOpenChange(false);
  };

  const providerKey = selectedProvider === 'chatgpt' ? 'openai' : 'anthropic';
  const providerConfig = AI_PROVIDERS[providerKey];
  const providerName = providerConfig.name;
  const placeholder = providerConfig.apiKeyPlaceholder;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{providerName} API Key</DialogTitle>
          <DialogDescription>
            Enter your {providerName === 'ChatGPT' ? 'OpenAI' : providerName} API key to use {providerName}. Your key
            will be stored locally and sent directly to {providerName === 'ChatGPT' ? 'OpenAI' : providerName}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="api-key" className="text-right">
              API Key
            </Label>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={placeholder}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
