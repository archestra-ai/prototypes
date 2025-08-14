import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ToolSelector } from '@ui/components/ToolSelector';
import { Button } from '@ui/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/ui/collapsible';
import config from '@ui/config';
import { useChatStore, useCloudProvidersStore, useOllamaStore } from '@ui/stores';

import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';
import SystemPrompt from './SystemPrompt';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  const { getCurrentChat, selectedTools, setSelectedTools } = useChatStore();
  const { selectedModel } = useOllamaStore();
  const { availableCloudProviderModels } = useCloudProvidersStore();
  const [localInput, setLocalInput] = useState('');
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  const currentChat = getCurrentChat();
  const currentChatSessionId = currentChat?.sessionId || '';
  const currentChatMessages = currentChat?.messages || [];

  // We use useRef because prepareSendMessagesRequest captures values when created.
  // Without ref, switching models/providers wouldn't work - it would always use the old values.
  // The refs let us always get the current selected model and provider values.
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;

  const availableCloudProviderModelsRef = useRef(availableCloudProviderModels);
  availableCloudProviderModelsRef.current = availableCloudProviderModels;

  const selectedToolsRef = useRef(selectedTools);
  selectedToolsRef.current = selectedTools;

  const transport = useMemo(() => {
    const apiEndpoint = `${config.archestra.chatStreamBaseUrl}/stream`;

    return new DefaultChatTransport({
      api: apiEndpoint,
      prepareSendMessagesRequest: ({ id, messages }) => {
        const currentModel = selectedModelRef.current;
        const currentCloudProviderModels = availableCloudProviderModelsRef.current;
        const currentSelectedTools = selectedToolsRef.current;

        const cloudModel = currentCloudProviderModels.find((m) => m.id === currentModel);
        const provider = cloudModel ? cloudModel.provider : 'ollama';

        return {
          body: {
            messages,
            model: currentModel || 'llama3.1:8b',
            sessionId: id || currentChatSessionId,
            provider: provider,
            requestedTools: currentSelectedTools.length > 0 ? currentSelectedTools : undefined,
            toolChoice: currentSelectedTools.length > 0 ? 'auto' : undefined,
          },
        };
      },
    });
  }, [currentChatSessionId]);

  const { sendMessage, messages, setMessages, stop, status, error } = useChat({
    id: currentChatSessionId || 'temp-id', // use the provided chat ID or a temp ID
    transport,
    onFinish: (message) => {
      console.log('Message finished:', message);
    },
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  const isLoading = status === 'streaming';

  // Load messages from database when chat changes
  useEffect(() => {
    if (currentChatMessages && currentChatMessages.length > 0) {
      // Messages are already UIMessage type
      setMessages(currentChatMessages);
    } else {
      // Clear messages when no chat or empty chat
      setMessages([]);
    }
  }, [currentChatSessionId]); // Only depend on session ID to avoid infinite loop

  // Log messages updates
  useEffect(() => {
    console.log('All messages in ChatPage:', messages);
    console.log('Messages length:', messages.length);
    console.log('isLoading:', isLoading);
    console.log('error:', error);
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      console.log('Last message:', lastMessage);
    }
  }, [messages, isLoading, error]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalInput(e.target.value);
  };

  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (localInput.trim()) {
      console.log('Sending message:', localInput);
      sendMessage({ text: localInput });
      setLocalInput('');
    }
  };

  if (!currentChat) {
    // TODO: this is a temporary solution, maybe let's make some cool loading animations with a mascot?
    return null;
  }

  return (
    <div className="flex flex-col h-full gap-2 max-w-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden max-w-full">
        <ChatHistory messages={messages} />
      </div>

      {/* Tool Selector Collapsible Panel */}
      <div className="flex-shrink-0 px-4">
        <Collapsible open={isToolsOpen} onOpenChange={setIsToolsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-muted-foreground hover:text-foreground"
            >
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                <span>Tool Selection</span>
                {selectedTools.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
                    {selectedTools.length} selected
                  </span>
                )}
              </div>
              {isToolsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <ToolSelector onToolsChange={setSelectedTools} selectedTools={selectedTools} />
            {selectedTools.length > 0 && (
              <div className="mt-2 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTools([])}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear selection
                </Button>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      <SystemPrompt />
      <div className="flex-shrink-0">
        <ChatInput
          input={localInput}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          stop={stop}
        />
      </div>
    </div>
  );
}
