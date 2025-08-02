import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDeveloperModeStore } from '@/stores/developer-mode-store';

interface SystemPromptProps {}

export default function SystemPrompt(_props: SystemPromptProps) {
  const { isDeveloperMode, systemPrompt, setSystemPrompt } = useDeveloperModeStore();

  if (!isDeveloperMode) {
    return null;
  }

  return (
    <div className="flex-shrink-0">
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
  );
}
