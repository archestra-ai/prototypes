import { SidebarIcon } from 'lucide-react';

import { ThemeToggler } from '@ui/components/ThemeToggler';
import { Button } from '@ui/components/ui/button';
import { Separator } from '@ui/components/ui/separator';
import { useSidebar } from '@ui/components/ui/sidebar';
import config from '@ui/config';
import { useChatStore } from '@ui/stores';
import { NavigationSubViewKey, NavigationViewKey } from '@ui/types';

import { Breadcrumbs } from './Breadcrumbs';

interface SiteHeaderProps {
  activeView: NavigationViewKey;
  activeSubView: NavigationSubViewKey;
}

export function SiteHeader({ activeView, activeSubView }: SiteHeaderProps) {
  const { toggleSidebar } = useSidebar();
  const { getCurrentChatTitle } = useChatStore();

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
      <div className="flex h-[var(--header-height)] w-full items-center gap-2 px-4 pl-[80px]" data-tauri-drag-region>
        <Button className="h-8 w-8 cursor-pointer" variant="ghost" size="icon" onClick={toggleSidebar}>
          <SidebarIcon />
        </Button>
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumbs breadcrumbs={breadcrumbs} isAnimatedTitle={activeView === NavigationViewKey.Chat} />
      </div>
      <div className="flex items-center gap-2 mr-4">
        <ThemeToggler />
      </div>
    </header>
  );
}
