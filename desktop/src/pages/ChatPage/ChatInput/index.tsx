'use client';

import { FileText } from 'lucide-react';
import React, { useEffect, useState } from 'react';

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
import { useChatStore, useIsStreaming } from '@/stores/chat-store';
import { useDeveloperModeStore } from '@/stores/developer-mode-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import { useOllamaStore } from '@/stores/ollama-store';

interface ChatInputProps {}

export default function ChatInput(_props: ChatInputProps) {
  const { sendChatMessage, clearChatHistory, cancelStreaming } = useChatStore();
  const { isDeveloperMode, toggleDeveloperMode } = useDeveloperModeStore();
  const isStreaming = useIsStreaming();

  const { installedModels, loadingInstalledModels, loadingInstalledModelsError, selectedModel, setSelectedModel } =
    useOllamaStore();

  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'submitted' | 'streaming' | 'ready' | 'error'>('ready');

  useEffect(() => {
    if (isStreaming) {
      setStatus('streaming');
    } else {
      setStatus('ready');
    }
  }, [isStreaming]);

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
    }

    setStatus('submitted');

    try {
      setMessage('');
      await sendChatMessage(message.trim());
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setTimeout(() => setStatus('ready'), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newMessage = message.substring(0, start) + '\n' + message.substring(end);
        setMessage(newMessage);

        setTimeout(() => {
          textarea.setSelectionRange(start + 1, start + 1);
        }, 0);
      } else {
        e.preventDefault();
        handleSubmit();
      }
    }
  };

  const handleModelChange = (modelName: string) => {
    setSelectedModel(modelName);
    clearChatHistory();
  };

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <AIInput onSubmit={handleSubmit} className="bg-inherit">
          <AIInputTextarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What would you like to know?"
            disabled={!selectedModel}
            minHeight={48}
            maxHeight={164}
          />
          <AIInputToolbar>
            <AIInputTools>
              <AIInputModelSelect
                defaultValue={selectedModel}
                value={selectedModel}
                onValueChange={handleModelChange}
                disabled={loadingInstalledModels || !!loadingInstalledModelsError}
              >
                <AIInputModelSelectTrigger>
                  <AIInputModelSelectValue
                    placeholder={
                      loadingInstalledModels
                        ? 'Loading models...'
                        : loadingInstalledModelsError
                          ? 'Error loading models'
                          : installedModels.length === 0
                            ? 'No models found'
                            : 'Select a model'
                    }
                  />
                </AIInputModelSelectTrigger>
                <AIInputModelSelectContent>
                  {installedModels.map((model) => (
                    <AIInputModelSelectItem key={model.name} value={model.name}>
                      {model.name}
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
            <AIInputSubmit
              status={status}
              onClick={cancelStreaming}
              // only disable if there's no message, and we're not streaming
              // if we're streaming, we want to allow the user to cancel the streaming
              disabled={!message.trim() && status !== 'streaming'}
            />
          </AIInputToolbar>
        </AIInput>
      </div>
    </TooltipProvider>
  );
}
