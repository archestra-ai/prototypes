import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDeveloperModeStore } from '@/stores/developer-mode-store';

import MCPServers from '../SettingsPage/MCPServers';
import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  const { isDeveloperMode, systemPrompt, setSystemPrompt } = useDeveloperModeStore();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Chat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChatHistory />
          <ChatInput />
          {isDeveloperMode && (
            <div className="space-y-4 p-3 bg-muted/30 rounded-md border border-muted">
              <div className="space-y-2">
                <Label htmlFor="system-prompt" className="text-sm font-medium text-muted-foreground">
                  System Prompt
                </Label>
                <Textarea
                  id="system-prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Enter system prompt for the AI assistant..."
                  className="min-h-20 resize-none"
                />
              </div>
              <MCPServers />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
