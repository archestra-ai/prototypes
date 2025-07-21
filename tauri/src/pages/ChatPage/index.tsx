import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import ChatInput from "./ChatInput";
import ChatHistory from "./ChatHistory";

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChatHistory />
        <ChatInput />
      </CardContent>
    </Card>
  );
}
