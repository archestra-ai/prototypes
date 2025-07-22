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
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div className="space-y-4">
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
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Main Chat Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Chat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ChatHistory />
              <ChatInput />
            </CardContent>
          </Card>
        </div>

        {/* Reasoning Panel - Sidebar on larger screens */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-4">
            <Collapsible open={showReasoning} onOpenChange={setShowReasoning} defaultOpen={true}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {showReasoning ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CardTitle className="text-lg">Agent Reasoning</CardTitle>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-0">
                    <ReasoningPanel maxHeight="600px" />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        </div>
      </div>
    </div>
  );
}
