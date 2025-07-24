'use client';

import { FileText, Settings, Wrench } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import {
  AIInput,
  AIInputButton,
  AIInputContextPills,
  AIInputModelSelect,
  AIInputModelSelectContent,
  AIInputModelSelectItem,
  AIInputModelSelectTrigger,
  AIInputModelSelectValue,
  AIInputSubmit,
  AIInputTextarea,
  AIInputToolbar,
  AIInputTools,
  ToolContext,
} from '@/components/kibo/ai-input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentStore } from '@/stores/agent-store';
import { useChatStore, useIsStreaming } from '@/stores/chat-store';
import { useDeveloperModeStore } from '@/stores/developer-mode-store';
import { useOllamaStore } from '@/stores/ollama-store';

interface ChatInputProps {
  selectedTools?: ToolContext[];
  onToolRemove?: (tool: ToolContext) => void;
}

export default function ChatInput({ selectedTools = [], onToolRemove }: ChatInputProps) {
  const { sendChatMessage, clearChatHistory, cancelStreaming } = useChatStore();
  const { isDeveloperMode, toggleDeveloperMode } = useDeveloperModeStore();
  const isStreaming = useIsStreaming();

  const { installedModels, loadingInstalledModels, loadingInstalledModelsError, selectedModel, setSelectedModel } =
    useOllamaStore();

  const { isAgentActive, mode: agentMode } = useAgentStore();

  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'submitted' | 'streaming' | 'ready' | 'error'>('ready');

  const disabled = isStreaming || (isAgentActive && agentMode === 'initializing');

  // Fetch installed models when component mounts
  useEffect(() => {
    useOllamaStore.getState().fetchInstalledModels();
  }, []);

  useEffect(() => {
    if (isStreaming) {
      setStatus('streaming');
    } else {
      setStatus('ready');
    }
  }, [isStreaming]);

  // Subscribe to agent state changes
  useEffect(() => {
    if (isAgentActive && agentMode === 'completed') {
      setStatus('ready');
    }
  }, [isAgentActive, agentMode]);

  const onSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
    }

    if (!message.trim() || disabled || !selectedModel) {
      return;
    }

    const trimmedMessage = message.trim();

    setStatus('submitted');

    try {
      let finalMessage = message.trim();

      // Add tool context to the message if tools are selected
      if (selectedTools.length > 0) {
        const toolContexts = selectedTools.map((tool) => `Use ${tool.toolName} from ${tool.serverName}`).join(', ');
        finalMessage = `${toolContexts}. ${finalMessage}`;
      }

      setMessage('');
      await sendChatMessage(finalMessage, selectedTools);
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

        // Move cursor position after the new line
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1;
        }, 0);
      } else if (!e.shiftKey) {
        e.preventDefault();
        if (!disabled) {
          onSubmit();
        }
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
        <AIInput onSubmit={onSubmit} className="bg-inherit">
          <AIInputContextPills tools={selectedTools} onRemoveTool={onToolRemove || (() => {})} />
          <AIInputTextarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled
                ? isStreaming
                  ? 'Waiting for response...'
                  : 'Agent is initializing...'
                : 'What would you like to know?'
            }
            disabled={disabled}
            minHeight={48}
            maxHeight={164}
          />
          <AIInputToolbar>
            <AIInputTools>
              <AIInputModelSelect
                defaultValue={selectedModel}
                value={selectedModel}
                onValueChange={setSelectedModel}
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
              status={isStreaming ? 'streaming' : status}
              onClick={isStreaming ? cancelStreaming : undefined}
              disabled={!message.trim() && status !== 'streaming'}
            />
          </AIInputToolbar>
        </AIInput>
      </div>
    </TooltipProvider>
  );
}
