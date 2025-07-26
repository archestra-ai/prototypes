import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';
import SystemPrompt from './SystemPrompt';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <ChatHistory />
      </div>
      <SystemPrompt />
      <div className="flex-shrink-0 p-4 bg-background">
        <ChatInput />
      </div>
    </div>
  );
}
