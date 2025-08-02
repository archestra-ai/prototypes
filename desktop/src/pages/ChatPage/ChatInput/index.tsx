'use client';

import { FileText } from 'lucide-react';
import React, { useCallback } from 'react';

import ToolPill from '@/components/ToolPill';
import {
  AIInput,
  AIInputButton,
  AIInputModelSelect,
  AIInputModelSelectContent,
  AIInputModelSelectItem,
  AIInputModelSelectTrigger,
  AIInputModelSelectValue,
  AIInputSubmit,
  AIInputTextarea,
  AIInputToolbar,
  AIInputTools,
} from '@/components/kibo/ai-input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AI_PROVIDERS } from '@/hooks/use-ai-chat';
import { cn } from '@/lib/utils/tailwind';
import { useChatStore } from '@/stores/chat-store';
import { useDeveloperModeStore } from '@/stores/developer-mode-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';

interface ChatInputProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e?: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  stop: () => void;
}

export default function ChatInput({ input, handleInputChange, handleSubmit, isLoading, stop }: ChatInputProps) {
  const { selectedTools } = useMCPServersStore();
  const { isDeveloperMode, toggleDeveloperMode } = useDeveloperModeStore();
  const { selectedProvider, selectedAIModel, setSelectedAIModel } = useChatStore();

  // Map provider to AI provider key
  const providerMap = {
    chatgpt: 'openai',
    claude: 'anthropic',
    ollama: 'ollama',
  } as const;

  const aiProviderKey = providerMap[selectedProvider];
  const aiProviderModels = aiProviderKey ? Object.entries(AI_PROVIDERS[aiProviderKey].models) : [];

  // Always use the centralized config
  const currentModel = selectedAIModel || '';
  const handleModelChange = setSelectedAIModel;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <TooltipProvider>
      <AIInput onSubmit={handleSubmit} className="bg-inherit">
        <div className={cn('flex flex-wrap gap-2 p-3 pb-0')}>
          {selectedTools.map((tool, index) => (
            <ToolPill key={`${tool.serverName}-${tool.toolName}-${index}`} tool={tool} />
          ))}
        </div>
        <AIInputTextarea
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to know?"
          disabled={false}
          minHeight={48}
          maxHeight={164}
        />
        <AIInputToolbar>
          <AIInputTools>
            <AIInputModelSelect value={currentModel} onValueChange={handleModelChange} disabled={false}>
              <AIInputModelSelectTrigger>
                <AIInputModelSelectValue placeholder="Select a model" />
              </AIInputModelSelectTrigger>
              <AIInputModelSelectContent>
                {aiProviderModels.map(([modelKey, modelConfig]) => (
                  <AIInputModelSelectItem key={modelKey} value={modelKey}>
                    {modelConfig.displayName}
                  </AIInputModelSelectItem>
                ))}
              </AIInputModelSelectContent>
            </AIInputModelSelect>
            <Tooltip>
              <TooltipTrigger asChild>
                <AIInputButton onClick={toggleDeveloperMode} className={isDeveloperMode ? 'bg-primary/20' : ''}>
                  <FileText size={16} />
                </AIInputButton>
              </TooltipTrigger>
              <TooltipContent>
                <span>Toggle system prompt</span>
              </TooltipContent>
            </Tooltip>
          </AIInputTools>
          <AIInputSubmit onClick={isLoading ? stop : undefined} disabled={!input.trim() && !isLoading} />
        </AIInputToolbar>
      </AIInput>
    </TooltipProvider>
  );
}
