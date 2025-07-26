import { Button } from '@/components/ui/button';
import { useSSEChat } from '@/hooks/use-sse-chat';

export function TestSSETools() {
  const { sendMessage, messages, status, error } = useSSEChat({
    onToolCall: async ({ toolCall }) => {
      console.log('🔧 Client-side tool call:', toolCall);
      // This is where you'd handle client-side tools if needed
      // For server-side tools, they're executed automatically
    },
    onError: (error) => {
      console.error('❌ SSE Error:', error);
    },
    onFinish: ({ message }) => {
      console.log('✅ Message finished:', message);
    },
  });

  const testMessages = [
    {
      text: 'Hello! Can you help me test the SSE streaming?',
      tools: [],
    },
    {
      text: 'What tools do you have available?',
      tools: [],
    },
    {
      text: 'Can you search for files with "agent" in the name?',
      tools: ['filesystem_search-files'],
    },
    {
      text: 'Show me the current weather',
      tools: ['weather_get-current-weather'],
    },
  ];

  const sendTestMessage = async (test: (typeof testMessages)[0]) => {
    console.log('📤 Sending test message:', test);
    await sendMessage(test.text, { tools: test.tools });
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">SSE Tool Testing</h2>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Status: <span className="font-mono">{status}</span>
        </p>
        {error && <p className="text-sm text-red-600">Error: {error.message}</p>}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Test Messages:</h3>
        {testMessages.map((test, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            onClick={() => sendTestMessage(test)}
            disabled={status === 'streaming'}
            className="block w-full text-left"
          >
            <div>
              <div className="font-medium">{test.text}</div>
              {test.tools.length > 0 && (
                <div className="text-xs text-muted-foreground">Tools: {test.tools.join(', ')}</div>
              )}
            </div>
          </Button>
        ))}
      </div>

      <div className="space-y-2 mt-4">
        <h3 className="text-sm font-medium">Messages:</h3>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {messages.map((msg, index) => (
            <div key={index} className="p-2 bg-muted rounded text-sm">
              <div className="font-medium">{msg.role}:</div>
              <pre className="whitespace-pre-wrap text-xs mt-1">{JSON.stringify(msg, null, 2)}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
