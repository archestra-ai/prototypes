import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { AgentControlPanel, AgentModeIndicator, ReasoningPanel } from '@/components/agent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  const [showAgentControls, setShowAgentControls] = useState(false);

  return (
    <div className="flex flex-col h-full overflow-hidden space-y-4">
      {/* Agent Control Panel - Collapsible */}
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

      {/* Main Chat Interface - Full Width */}
      <div className="flex flex-col flex-1 min-h-0">
        <Card className="flex flex-col flex-1">
          <CardHeader>
            <CardTitle>Chat</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 gap-4 min-h-0">
            <div className="flex-1 min-h-0">
              <ChatHistory />
            </div>
            <div className="flex-shrink-0">
              <ChatInput />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
