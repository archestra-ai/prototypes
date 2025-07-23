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
    <div className="flex flex-col h-full">
      {/* Chat History - Takes all available space and scrolls */}
      <div className="flex-1 min-h-0">
        <ChatHistory />
      </div>

      {/* Developer Mode Section - Fixed at bottom when enabled */}
      {isDeveloperMode && (
        <div className="flex-shrink-0 px-4 pb-2">
          <div className="space-y-2 p-3 bg-muted/30 rounded-md border border-muted">
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
        </div>
      )}

      {/* Chat Input - Always at bottom */}
      <div className="flex-shrink-0 p-4 bg-background">
        <ChatInput />
      </div>
    </div>
  );
}
