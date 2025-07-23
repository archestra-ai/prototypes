import { ChevronLeft, ChevronRight, SidebarIcon } from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSidebar } from '@/components/ui/sidebar';

import { ModeToggle } from './mode-toggle';

// import { useRouter, useCanGoBack } from "@tanstack/react-router";

export function SiteHeader(props) {
  const { toggleSidebar } = useSidebar();
  // const router = useRouter();

  return (
    <header className="bg-background sticky top-0 z-50 flex w-full items-center border-b">
      <div className="flex h-[var(--header-height)] w-full items-center gap-2 px-4 pl-[80px]" data-tauri-drag-region>
        <Button className="h-8 w-8" variant="ghost" size="icon" onClick={toggleSidebar}>
          <SidebarIcon />
        </Button>
        {/* <Button
          className="h-8 w-8"
          variant="ghost"
          size="icon"
          onClick={() => {
            router.history.back();
          }}
          disabled={!useCanGoBack()}
        >
          <ChevronLeft />
        </Button>
        <Button
          className="h-8 w-8"
          variant="ghost"
          size="icon"
          onClick={() => {
            router.history.forward();
          }}
        >
          <ChevronRight />
        </Button> */}
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb className="hidden sm:block">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink>Archestra</BreadcrumbLink>
            </BreadcrumbItem>
            {props.breadcrumbs?.map((breadcrumb, index) => (
              <>
                <BreadcrumbSeparator key={`sep-${index}`} />
                <BreadcrumbItem key={index}>
                  {index === props.breadcrumbs.length - 1 ? (
                    <BreadcrumbPage>{breadcrumb}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink>{breadcrumb}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </>
            )) || (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{props.title}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-2 mr-4">
        <ModeToggle />
      </div>
    </header>
  );
}
