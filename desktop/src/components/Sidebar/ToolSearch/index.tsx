import { Input } from '@/components/ui/input';
import { useMCPServersStore } from '@/stores/mcp-servers-store';

interface ToolSearchProps {}

export default function ToolSearch(_props: ToolSearchProps) {
  const { allTools, toolSearchQuery, setToolSearchQuery } = useMCPServersStore();

  if (Object.keys(allTools).length === 0) {
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
