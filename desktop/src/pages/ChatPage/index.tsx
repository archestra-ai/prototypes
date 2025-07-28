import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';
import SystemPrompt from './SystemPrompt';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  return (
    <div className="flex flex-col h-full gap-2 max-w-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden max-w-full">
        <ChatHistory />
      </div>
      <SystemPrompt />
      <div className="flex-shrink-0">
        <ChatInput />
      </div>
    </div>
  );
}
