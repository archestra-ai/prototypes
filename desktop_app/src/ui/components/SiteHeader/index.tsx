import { Plus, SidebarIcon } from 'lucide-react';

import { ThemeToggler } from '@ui/components/ThemeToggler';
import { Button } from '@ui/components/ui/button';
import { Separator } from '@ui/components/ui/separator';
import { useSidebar } from '@ui/components/ui/sidebar';
import config from '@ui/config';
import { useChatStore, useNavigationStore } from '@ui/stores';
import { NavigationSubViewKey, NavigationViewKey } from '@ui/types';

import { Breadcrumbs } from './Breadcrumbs';

interface SiteHeaderProps {
  activeView: NavigationViewKey;
  activeSubView: NavigationSubViewKey;
}

export function SiteHeader({ activeView, activeSubView }: SiteHeaderProps) {
  const { toggleSidebar } = useSidebar();
  const { getCurrentChatTitle, createNewChat } = useChatStore();
  const { setActiveView } = useNavigationStore();

  let breadcrumbs: string[] = [];
  if (activeView === NavigationViewKey.Chat) {
    breadcrumbs = ['Chat', getCurrentChatTitle()];
  } else if (activeView === NavigationViewKey.LLMProviders) {
    breadcrumbs = ['LLM Providers', activeSubView.charAt(0).toUpperCase() + activeSubView.slice(1)];
  } else {
    breadcrumbs = [config.navigation.find((item) => item.key === activeView)?.title || ''];
  }

  return (
    <header className="bg-background sticky top-0 z-50 flex w-full items-center border-b">
      <div
        className="flex h-[var(--header-height)] w-64 items-center gap-2 px-4 pl-20 border-r"
        // @ts-expect-error - WebkitAppRegion is not a valid property
        style={{ WebkitAppRegion: 'drag' }}
      >
        <Button
          className="h-8 w-8 cursor-pointer"
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          // @ts-expect-error - WebkitAppRegion is not a valid property
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <SidebarIcon />
        </Button>
        <Button
          className="h-8 cursor-pointer"
          variant="ghost"
          size="sm"
          onClick={async () => {
            await createNewChat();
            setActiveView(NavigationViewKey.Chat);
          }}
          // @ts-expect-error - WebkitAppRegion is not a valid property
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Chat
        </Button>
      </div>
      <div
        className="flex h-[var(--header-height)] flex-1 items-center justify-between px-4"
        // @ts-expect-error - WebkitAppRegion is not a valid property
        style={{ WebkitAppRegion: 'drag' }}
      >
        {/* @ts-expect-error - WebkitAppRegion is not a valid property */}
        <div style={{ WebkitAppRegion: 'no-drag' }}>
          <Breadcrumbs breadcrumbs={breadcrumbs} isAnimatedTitle={activeView === NavigationViewKey.Chat} />
        </div>
        {/* @ts-expect-error - WebkitAppRegion is not a valid property */}
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
          <ThemeToggler />
        </div>
      </div>
    </header>
  );
}
