'use client';

import { ChevronDown, MicIcon, PaperclipIcon, Settings, Wrench } from 'lucide-react';
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
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentStore } from '@/stores/agent-store';
import { useChatStore, useIsStreaming } from '@/stores/chat-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import { useOllamaStore } from '@/stores/ollama-store';

interface ChatInputProps {}

export default function ChatInput(_props: ChatInputProps) {
  const { loadingInstalledMCPServers } = useMCPServersStore();
  const allToolsObject = useMCPServersStore.getState().allAvailableTools();
  const allTools = Object.values(allToolsObject).flat();
  const { sendChatMessage, cancelStreaming } = useChatStore();
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

  return (
    <form onSubmit={onSubmit}>
      <AIInput className="px-6 pb-6">
        <AIInputModelSelect>
          <AIInputModelSelectTrigger className="px-2 py-1">
            <Wrench className="mr-2 h-4 w-4" />
            <AIInputModelSelectValue placeholder={loadingInstalledModels ? 'Loading models...' : 'Select a model'} />
            <ChevronDown className="ml-2 h-4 w-4" />
          </AIInputModelSelectTrigger>
          <AIInputModelSelectContent>
            {installedModels.map((model) => (
              <AIInputModelSelectItem key={model.name} value={model.name} onClick={() => setSelectedModel(model.name)}>
                {model.name}
              </AIInputModelSelectItem>
            ))}
          </AIInputModelSelectContent>
        </AIInputModelSelect>

        <AIInputTextarea
          className="resize-none"
          placeholder={disabled ? 'Agent is initializing...' : 'Type a message...'}
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <AIInputToolbar>
          <AIInputTools>
            <AIInputButton
              size="icon"
              variant="ghost"
              disabled={disabled}
              onClick={(e) => {
                e.preventDefault();
                setIsToolsMenuOpen(!isToolsMenuOpen);
              }}
            >
              <Wrench />
            </AIInputButton>
            <AIInputButton size="icon" variant="ghost">
              <PaperclipIcon />
            </AIInputButton>
            <AIInputButton size="icon" variant="ghost">
              <MicIcon />
            </AIInputButton>
          </AIInputTools>
          <div className="flex items-center gap-2">
            {loadingInstalledModelsError && (
              <span className="text-xs text-red-600">Error loading models: {loadingInstalledModelsError.message}</span>
            )}
            {status === 'error' && <span className="text-xs text-red-600">Failed to send message</span>}
            {selectedModel && <Badge variant="secondary">{selectedModel}</Badge>}
            {isStreaming ? (
              <AIInputSubmit
                type="button"
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault();
                  cancelStreaming();
                }}
              >
                Cancel
              </AIInputSubmit>
            ) : (
              <AIInputSubmit disabled={disabled || !selectedModel}>Send</AIInputSubmit>
            )}
          </div>
        </AIInputToolbar>

        <TooltipProvider>
          <Collapsible open={isToolsMenuOpen} onOpenChange={setIsToolsMenuOpen}>
            <CollapsibleContent className="CollapsibleContent">
              <div className="mt-4 rounded-md border bg-card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">Available Tools</h3>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          // Navigate to settings page
                          window.location.hash = '#/settings';
                        }}
                        className="rounded-md p-1 hover:bg-gray-200"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Manage MCP Servers</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                {loadingInstalledMCPServers ? (
                  <div className="text-sm text-muted-foreground">Loading tools...</div>
                ) : allTools.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No tools available. Install MCP servers to enable tools.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {allTools.map((tool) => (
                      <div
                        key={tool.name}
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
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </TooltipProvider>
      </AIInput>
    </form>
  );
}
