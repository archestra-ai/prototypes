'use client';

import { FileText } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

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
import { ToolContext } from '@/components/kibo/ai-input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/tailwind';
import { useChatContext } from '@/providers/chat-provider';
import { useAgentStore } from '@/stores/agent-store';
import { useDeveloperModeStore } from '@/stores/developer-mode-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import { useOllamaStore } from '@/stores/ollama-store';
import { ChatInteractionStatus } from '@/types';

interface ChatInputProps {}

// AIInputContextPills component for displaying selected tools
interface AIInputContextPillsProps {
  tools: ToolContext[];
  onRemoveTool: (tool: ToolContext) => void;
}

function AIInputContextPills({ tools, onRemoveTool }: AIInputContextPillsProps) {
  if (!tools || tools.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2 p-3 pb-0')}>
      {tools.map((tool, index) => (
        <ToolPill
          key={`${tool.serverName}-${tool.toolName}-${index}`}
          tool={tool}
          onRemove={() => onRemoveTool(tool)}
        />
      ))}
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

  const { isAgentActive, mode: agentMode } = useAgentStore();

  const disabled = isStreaming || (isAgentActive && agentMode === 'initializing');
  const canSend = !disabled && input.trim().length > 0 && selectedModel !== null;

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

    // Handle agent commands
    if (trimmedInput.startsWith('/agent')) {
      const objective = trimmedInput.substring(6).trim();

      if (!objective) {
        // Send the message as-is, let backend handle the error
        await sendMessage({ text: trimmedInput });
        setInput('');
        return;
      }

      // Activate agent state locally
      const { activateAgent } = useAgentStore.getState();
      await activateAgent(objective);
    } else if (trimmedInput === '/stop' && isAgentActive) {
      // Stop agent locally
      const { stopAgent } = useAgentStore.getState();
      stopAgent();
    }

    // For all messages (including agent commands), send through SSE
    // The backend will handle the actual processing
    console.log('[ChatInput] Sending message:', trimmedInput);
    try {
      // Prepare the body data for the backend
      const body: any = {
        model: selectedModel,
        // Convert tools to tool names if any
        tools: selectedTools?.map((tool) => `${tool.serverName}_${tool.toolName}`) || [],
      };

      // Add agent context if this is an agent command
      if (trimmedInput.startsWith('/agent')) {
        const objective = trimmedInput.substring(6).trim();
        if (objective) {
          body.agent_context = {
            mode: 'autonomous',
            objective: objective,
            activate: true,
          };
        }
      } else if (trimmedInput === '/stop' && isAgentActive) {
        body.agent_context = {
          mode: 'stop',
        };
      }

      // For v5, sendMessage expects an object with text property
      const result = await sendMessage({
        text: trimmedInput,
        metadata: body,
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

  const handleToolRemove = (tool: ToolContext) => {
    useMCPServersStore.getState().toggleSelectedTool(tool.serverName, tool.toolName);
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
          <AIInputContextPills tools={selectedTools} onRemoveTool={handleToolRemove} />
          <AIInputTextarea
            value={input}
            onChange={handleInputChange}
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
              status={isStreaming ? 'streaming' : 'ready'}
              onClick={isStreaming ? cancelStreaming : undefined}
              disabled={!canSend}
            />
          </AIInputToolbar>
        </AIInput>
      </div>
    </TooltipProvider>
  );
}
