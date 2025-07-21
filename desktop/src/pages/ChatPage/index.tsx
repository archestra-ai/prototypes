import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  return (
    <div className="space-y-4">
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
  );
}
