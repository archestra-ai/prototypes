import { Input } from '@/components/ui/input';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import { useThemeStore } from '@/stores/theme-store';

interface ToolSearchProps {}

export default function ToolSearch(_props: ToolSearchProps) {
  useThemeStore();
  const { availableTools, toolSearchQuery, setToolSearchQuery } = useMCPServersStore();

  const hasTools = Object.keys(availableTools).length > 0;

  if (!hasTools) {
    return null;
  }

  return (
    <div className="px-4 pb-2">
      <Input
        placeholder="Search tools..."
        value={toolSearchQuery}
        onChange={(e) => setToolSearchQuery(e.target.value)}
        className="h-7 text-xs"
      />
    </div>
  );
}
