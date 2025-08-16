import { Outlet, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';

import Sidebar from '@ui/components/Sidebar';
import { SiteHeader } from '@ui/components/SiteHeader';
import { SidebarProvider } from '@ui/components/ui/sidebar';

export const Route = createRootRoute({
  component: () => (
    <div className="[--header-height:2.25rem] h-screen flex flex-col">
      <SidebarProvider className="flex flex-col flex-1">
        <SiteHeader />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <Outlet />
        </div>
      </SidebarProvider>
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </div>
  ),
});
