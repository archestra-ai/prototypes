'use client';

import { ChevronDown, FileText, MicIcon, PaperclipIcon, Settings, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';

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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore, useIsStreaming } from '@/stores/chat-store';
import { useDeveloperModeStore } from '@/stores/developer-mode-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import { useOllamaStore } from '@/stores/ollama-store';

interface ChatInputProps {}

export default function ChatInput(_props: ChatInputProps) {
  const { loadingInstalledMCPServers } = useMCPServersStore();
  const allTools = useMCPServersStore.getState().allAvailableTools();
  const { isChatLoading, sendChatMessage, clearChatHistory, cancelStreaming } = useChatStore();
  const { isDeveloperMode, toggleDeveloperMode } = useDeveloperModeStore();
  const isStreaming = useIsStreaming();

  const { installedModels, loadingInstalledModels, loadingInstalledModelsError, selectedModel, setSelectedModel } =
    useOllamaStore();

  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'submitted' | 'streaming' | 'ready' | 'error'>('ready');
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);

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

  const totalNumberOfTools = Object.keys(allTools).length;

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
                {Object.entries(allTools).map(([serverName, tools]) => (
                  <Collapsible key={serverName}>
                    <CollapsibleTrigger className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer w-full">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{serverName}</span>
                        <Badge variant="outline" className="text-xs">
                          {tools.length} tool{tools.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <ChevronDown className="h-4 w-4 transition-transform" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-4 space-y-1">
                        {tools.map((tool, idx) => (
                          <Tooltip key={idx}>
                            <TooltipTrigger asChild>
                              <div className="p-2 hover:bg-muted rounded text-sm cursor-help">
                                <span className="font-mono text-primary">{tool.name}</span>
                                {tool.description && (
                                  <div className="text-muted-foreground text-xs mt-1">{tool.description}</div>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <div className="space-y-1">
                                <div className="font-medium">{tool.name}</div>
                                {tool.description && (
                                  <div className="text-sm text-muted-foreground">{tool.description}</div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </div>
        )}

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
            <AIInputSubmit status={status} onClick={cancelStreaming} disabled={isStreaming || isChatLoading} />
          </AIInputToolbar>
        </AIInput>
      </div>
    </TooltipProvider>
  );
}
