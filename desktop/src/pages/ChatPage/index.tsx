import { AgentModeIndicator } from '@/components/agent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Chat</CardTitle>
            <AgentModeIndicator />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChatHistory />
          <ChatInput />
        </CardContent>
      </Card>
    </div>
  );
}
