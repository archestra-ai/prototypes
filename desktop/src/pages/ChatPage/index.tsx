import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { AgentControlPanel, AgentModeIndicator, ReasoningPanel } from '@/components/agent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChatProvider } from '@/providers/chat-provider';

import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';
import SystemPrompt from './SystemPrompt';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  const [showAgentControls, setShowAgentControls] = useState(false);

  return (
    <ChatProvider>
      <div className="flex flex-col h-full">
        {/* Agent Control Panel - Collapsible */}
        <div className="flex-shrink-0 px-4 pt-4">
          <Collapsible open={showAgentControls} onOpenChange={setShowAgentControls}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {showAgentControls ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CardTitle>Agent Controls</CardTitle>
                    </div>
                    <AgentModeIndicator />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <AgentControlPanel />
                  <ReasoningPanel />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>

        {/* Main Chat Section */}
        <div className="flex-1 min-h-0 px-4 pb-4 mt-4">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>Chat</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
              <div className="flex-1 overflow-hidden min-h-0">
                <ChatHistory />
              </div>

              <SystemPrompt />

              {/* Chat Input - Always at bottom */}
              <div className="flex-shrink-0 p-4">
                <ChatInput />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ChatProvider>
  );
}
