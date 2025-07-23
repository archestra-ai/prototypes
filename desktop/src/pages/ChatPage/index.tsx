import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
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
  );
}
