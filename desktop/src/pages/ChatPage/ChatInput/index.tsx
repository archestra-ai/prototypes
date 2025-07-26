'use client';

import { FileText } from 'lucide-react';
import React, { useCallback, useState } from 'react';

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
import { cn } from '@/lib/utils/tailwind';
import { useChatStore } from '@/stores/chat-store';
import { useDeveloperModeStore } from '@/stores/developer-mode-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import { useOllamaStore } from '@/stores/ollama-store';
import { ChatInteractionStatus } from '@/types';

interface ChatInputProps {}

export default function ChatInput(_props: ChatInputProps) {
  const { sendChatMessage, cancelStreaming, getStatus, setStatus } = useChatStore();
  const { selectedTools } = useMCPServersStore();
  const { isDeveloperMode, toggleDeveloperMode } = useDeveloperModeStore();
  const { installedModels, loadingInstalledModels, loadingInstalledModelsError, selectedModel, setSelectedModel } =
    useOllamaStore();

  const status = getStatus();
  const isStreaming = status === ChatInteractionStatus.Streaming;
  const [message, setMessage] = useState('');
  const hasSelectedTools = Object.keys(selectedTools).length > 0;

  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      if (e) {
        e.preventDefault();
      }

      setStatus(ChatInteractionStatus.Submitted);

      try {
        let finalMessage = message.trim();

        // Add tool context to the message if tools are selected
        if (hasSelectedTools) {
          const toolContexts = selectedTools.map(({ name, serverName }) => `Use ${name} from ${serverName}`).join(', ');
          finalMessage = `${toolContexts}. ${finalMessage}`;
        }

        setMessage('');
        await sendChatMessage(finalMessage);
        setStatus(ChatInteractionStatus.Ready);
      } catch (error) {
        setStatus(ChatInteractionStatus.Error);
        setTimeout(() => setStatus(ChatInteractionStatus.Ready), 2000);
      }
    },
    [hasSelectedTools, message, sendChatMessage, selectedTools]
  );

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
  };

  return (
    <TooltipProvider>
      <AIInput onSubmit={handleSubmit} className="bg-inherit">
        <div className={cn('flex flex-wrap gap-2 p-3 pb-0')}>
          {selectedTools.map((tool, index) => (
            <ToolPill key={`${tool.serverName}-${tool.toolName}-${index}`} tool={tool} />
          ))}
        </div>
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
            disabled={!message.trim() && !isStreaming}
          />
        </AIInputToolbar>
      </AIInput>
    </TooltipProvider>
  );
}
