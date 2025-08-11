import { SidebarMenuButton, SidebarMenuItem } from '@ui/components/ui/sidebar';
import { useNavigationStore } from '@ui/stores';
import { NavigationSubViewKey } from '@ui/types';

interface LLMProvidersSidebarSectionProps {}

export default function LLMProvidersSidebarSection(_props: LLMProvidersSidebarSectionProps) {
  const { activeSubView, setActiveSubView } = useNavigationStore();

  return (
    <SidebarMenuItem className="ml-6 group-data-[collapsible=icon]:hidden">
      <SidebarMenuButton
        onClick={() => setActiveSubView(NavigationSubViewKey.Ollama)}
        isActive={activeSubView === NavigationSubViewKey.Ollama}
        size="sm"
        className="cursor-pointer hover:bg-accent/50 text-sm"
      >
        <span>Ollama</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
