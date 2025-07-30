'use client';

import { FileText } from 'lucide-react';
import React, { useEffect, useState } from 'react';

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
// Remove this import - ToolContext is defined below
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/tailwind';
import { useChatContext } from '@/providers/chat-provider';
import { useDeveloperModeStore } from '@/stores/developer-mode-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import { useOllamaStore } from '@/stores/ollama-store';
import { ChatMessageStatus, ToolWithMCPServerName } from '@/types';

// Use a type alias for tool context that maps to our existing types
type ToolContext = Pick<ToolWithMCPServerName, 'serverName' | 'enabled' | 'description'> & {
  toolName: string; // maps to 'name' in ToolWithMCPServerName
};

interface ChatInputProps {}

// AIInputContextPills component for displaying selected tools
interface AIInputContextPillsProps {
  tools: ToolContext[];
}

function AIInputContextPills({ tools }: AIInputContextPillsProps) {
  if (!tools || tools.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2 p-3 pb-0')}>
      {tools.map((tool, index) => {
        // Convert ToolContext to ToolWithMCPServerName
        const toolWithMCPServerName = {
          serverName: tool.serverName,
          name: tool.toolName,
          enabled: tool.enabled,
          description: tool.description || '',
          inputSchema: { type: 'object' as const }, // Add minimal schema as it's required by BaseTool
        };
        return <ToolPill key={`${tool.serverName}-${tool.toolName}-${index}`} tool={toolWithMCPServerName} />;
      })}
    </div>
  );
}

export default function ChatInput(_props: ChatInputProps) {
  // Manage input state locally since v5 doesn't provide it
  const [input, setInput] = useState('');

  // Use the shared chat context
  const { sendMessage, status, stop: cancelStreaming, setMessages } = useChatContext();

  // Get selected tools from store
  const { selectedTools } = useMCPServersStore();

  const { isDeveloperMode, toggleDeveloperMode } = useDeveloperModeStore();
  const isStreaming = status === 'streaming' || status === 'submitted';

  const { installedModels, loadingInstalledModels, loadingInstalledModelsError, selectedModel, setSelectedModel } =
    useOllamaStore();

  const disabled = isStreaming;
  const canSend = !disabled && input.trim().length > 0 && selectedModel !== null;
  const canStop = isStreaming;

  // Fetch installed models when component mounts
  useEffect(() => {
    useOllamaStore.getState().fetchInstalledModels();
  }, []);

  const onSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
    }

    if (!input.trim() || disabled || !selectedModel) {
      return;
    }

    // Handle special commands
    const trimmedInput = input.trim();
    try {
      // Prepare the metadata for the backend
      const metadata: any = {
        model: selectedModel,
        // Convert tools to tool names if any
        tools: selectedTools?.map((tool) => `${tool.serverName}_${tool.name}`) || [],
        // Add options from ollama-store to control verbosity
        options: {
          temperature: 0.7,
          top_p: 0.95,
          top_k: 40,
          num_predict: 2048, // Reduced from 15000 to make responses less verbose
        },
      };

      // Update global metadata in ChatProvider before sending
      // We need to access the globalMetadata variable from ChatProvider
      // This is a workaround for Vercel AI SDK v5 limitations
      (window as any).__CHAT_METADATA__ = metadata;

      // For v5, sendMessage expects an object with text property
      const result = await sendMessage({
        text: trimmedInput,
      });
      console.log('[ChatInput] Message sent successfully, result:', result);
    } catch (error) {
      console.error('[ChatInput] Error sending message:', error);
    }
    setInput(''); // Clear input after sending
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = input.substring(0, start) + '\n' + input.substring(end);

        setInput(newValue);

        // Move cursor position after the new line
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1;
        }, 0);
      } else if (!e.shiftKey) {
        e.preventDefault();
        if (!disabled && canSend) {
          onSubmit();
        }
      }
    }
  };

  const handleModelChange = (modelName: string) => {
    setSelectedModel(modelName);
    setMessages([]); // Clear chat history when changing models
  };

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <AIInput onSubmit={onSubmit} className="bg-inherit">
          <AIInputContextPills
            tools={selectedTools.map((tool) => ({
              serverName: tool.serverName,
              toolName: tool.name,
              enabled: tool.enabled,
              description: tool.description,
            }))}
          />
          <AIInputTextarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? 'Waiting for response...' : 'What would you like to know?'}
            disabled={disabled}
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
              status={canStop ? ChatMessageStatus.Streaming : ChatMessageStatus.Ready}
              onClick={
                canStop
                  ? () => {
                      if (isStreaming) {
                        cancelStreaming();
                      }
                    }
                  : undefined
              }
              disabled={!canSend && !canStop}
            />
          </AIInputToolbar>
        </AIInput>
      </div>
    </TooltipProvider>
  );
}
