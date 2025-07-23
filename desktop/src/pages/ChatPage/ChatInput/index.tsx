'use client';

import { ChevronDown, FileText, MicIcon, PaperclipIcon, Settings, Wrench } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentStore } from '@/stores/agent-store';
import { useChatStore, useIsStreaming } from '@/stores/chat-store';
import { useDeveloperModeStore } from '@/stores/developer-mode-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import { useOllamaStore } from '@/stores/ollama-store';

interface ChatInputProps {}

export default function ChatInput(_props: ChatInputProps) {
  const { loadingInstalledMCPServers } = useMCPServersStore();
  const allToolsObject = useMCPServersStore.getState().allAvailableTools();
  const allTools = Object.values(allToolsObject).flat();
  const { sendChatMessage, clearChatHistory, cancelStreaming } = useChatStore();
  const { isDeveloperMode, toggleDeveloperMode } = useDeveloperModeStore();
  const isStreaming = useIsStreaming();

  const {
    installedModels,
    loadingInstalledModels,
    loadingInstalledModelsError,
    selectedModel,
    setSelectedModel,
    initializeOllama,
    ollamaClient,
  } = useOllamaStore();

  const { isAgentActive, mode: agentMode } = useAgentStore();

  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'submitted' | 'streaming' | 'ready' | 'error'>('ready');
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);

  const disabled = isStreaming || (isAgentActive && agentMode === 'initializing');

  // Initialize Ollama when component mounts
  useEffect(() => {
    if (!ollamaClient) {
      initializeOllama().catch(console.error);
    }
  }, [ollamaClient, initializeOllama]);

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
      setMessage('');
      await sendChatMessage(trimmedMessage);
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

  const totalNumberOfTools = allTools.length;

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {isToolsMenuOpen && (totalNumberOfTools > 0 || loadingInstalledMCPServers) && (
          <div className="border rounded-lg p-3 bg-muted/50">
            {loadingInstalledMCPServers ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">Loading available tools...</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <Wrench className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium">Available Tools</span>
                  <Badge variant="secondary" className="text-xs">
                    Total: {totalNumberOfTools}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {allTools.map((tool, idx) => (
                    <div
                      key={idx}
                      className="group flex cursor-pointer items-start gap-2 rounded-md p-2 hover:bg-accent"
                      onClick={(e) => {
                        e.preventDefault();
                        const toolCommand = `Use the ${tool.name} tool`;
                        setMessage(toolCommand);
                        setIsToolsMenuOpen(false);
                      }}
                    >
                      <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">{tool.name}</div>
                        <div className="text-xs text-muted-foreground">{tool.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <AIInput onSubmit={onSubmit} className="bg-inherit">
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
              {(totalNumberOfTools > 0 || loadingInstalledMCPServers) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AIInputButton
                      onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)}
                      className={isToolsMenuOpen ? 'bg-primary/20' : ''}
                    >
                      <Settings size={16} />
                    </AIInputButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>
                      {loadingInstalledMCPServers ? 'Loading tools...' : `${totalNumberOfTools} tools available`}
                    </span>
                  </TooltipContent>
                </Tooltip>
              )}
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
