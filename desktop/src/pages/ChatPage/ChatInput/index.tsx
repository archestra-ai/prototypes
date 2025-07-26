'use client';

import { FileText } from 'lucide-react';
import React, { useEffect } from 'react';

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSSEChat } from '@/hooks/use-sse-chat';
import { useAgentStore } from '@/stores/agent-store';
import { useChatStore } from '@/stores/chat-store';
import { useDeveloperModeStore } from '@/stores/developer-mode-store';
import { useOllamaStore } from '@/stores/ollama-store';

interface ChatInputProps {
  selectedTools?: ToolContext[];
  onToolRemove?: (tool: ToolContext) => void;
}

export default function ChatInput({ selectedTools = [], onToolRemove }: ChatInputProps) {
  // Use SSE chat hook for sending messages
  const { sendMessage: sendSSEMessage, status: sseStatus, stop: cancelStreaming, input, setInput } = useSSEChat();

  const { clearChatHistory } = useChatStore();
  const { isDeveloperMode, toggleDeveloperMode } = useDeveloperModeStore();
  const isStreaming = sseStatus === 'streaming' || sseStatus === 'submitted';

  const { installedModels, loadingInstalledModels, loadingInstalledModelsError, selectedModel, setSelectedModel } =
    useOllamaStore();

  const { isAgentActive, mode: agentMode } = useAgentStore();

  const disabled = isStreaming || (isAgentActive && agentMode === 'initializing');

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

    try {
      let finalMessage = input.trim();
      const { activateAgent, currentObjective, stopAgent } = useAgentStore.getState();

      // Handle agent commands
      if (finalMessage.startsWith('/agent')) {
        const objective = finalMessage.substring(6).trim();

        if (!objective) {
          // This will be handled by the error message in the response
          setInput('');
          return;
        }

        // Activate agent state
        await activateAgent(objective);

        // Send the objective as the initial message with agent context
        setInput('');
        await sendSSEMessage(objective, {
          tools: selectedTools.map((tool) => `${tool.serverName}_${tool.toolName}`),
          agentContext: {
            mode: 'autonomous',
            objective: objective,
            activate: true,
          },
        });
        return;
      }

      // Handle stop command
      if (finalMessage === '/stop' && isAgentActive) {
        stopAgent();
        setInput('');
        // Send stop signal through SSE
        await sendSSEMessage('/stop', {
          agentContext: {
            mode: 'stop',
          },
        });
        return;
      }

      // Regular message or agent interaction
      const agentContext = isAgentActive
        ? {
            mode: 'autonomous',
            objective: currentObjective,
          }
        : undefined;

      // Add tool context to the message if tools are selected (only for non-agent mode)
      if (!isAgentActive && selectedTools.length > 0) {
        const toolContexts = selectedTools.map((tool) => `Use ${tool.toolName} from ${tool.serverName}`).join(', ');
        finalMessage = `${toolContexts}. ${finalMessage}`;
      }

      setInput('');
      await sendSSEMessage(finalMessage, {
        tools: selectedTools.map((tool) => `${tool.serverName}_${tool.toolName}`),
        agentContext,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newMessage = input.substring(0, start) + '\n' + input.substring(end);
        setInput(newMessage);

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
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
              disabled={!input.trim() && sseStatus !== 'streaming'}
            />
          </AIInputToolbar>
        </AIInput>
      </div>
    </TooltipProvider>
  );
}
