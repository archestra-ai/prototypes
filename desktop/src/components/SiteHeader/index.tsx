import { SidebarIcon } from 'lucide-react';

import { ThemeToggler } from '@/components/ThemeToggler';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSidebar } from '@/components/ui/sidebar';
import { NAVIGATION_ITEMS } from '@/consts';
import { useChatStore } from '@/stores/chat-store';
import { NavigationSubViewKey, NavigationViewKey } from '@/types';

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
    breadcrumbs = [NAVIGATION_ITEMS.find((item) => item.key === activeView)?.title || ''];
  }

  let isAnimatedTitle = false;
  if (activeView === NavigationViewKey.Chat && !getCurrentChatTitle()) {
    isAnimatedTitle = true;
  }

  return (
    <header className="bg-background sticky top-0 z-50 flex w-full items-center border-b">
      <div className="flex h-[var(--header-height)] w-full items-center gap-2 px-4 pl-[80px]" data-tauri-drag-region>
        <Button className="h-8 w-8" variant="ghost" size="icon" onClick={toggleSidebar}>
          <SidebarIcon />
        </Button>
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumbs breadcrumbs={breadcrumbs} isAnimatedTitle={isAnimatedTitle} />
      </div>
      <div className="flex items-center gap-2 mr-4">
        <ThemeToggler />
      </div>
    </header>
  );
}
