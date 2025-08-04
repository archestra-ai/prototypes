import { NavigationViewKey } from '@types';
import Sidebar from '@ui/components/Sidebar';
import { SidebarInset } from '@ui/components/ui/sidebar';
import ChatPage from '@ui/pages/ChatPage';
import ConnectorCatalogPage from '@ui/pages/ConnectorCatalogPage';
import LLMProvidersPage from '@ui/pages/LLMProvidersPage';
import SettingsPage from '@ui/pages/SettingsPage';
import { useNavigationStore } from '@ui/stores/navigation-store';

export default function App() {
  const { activeView, activeSubView } = useNavigationStore();

  const renderContent = () => {
    switch (activeView) {
      case NavigationViewKey.Chat:
        return <ChatPage />;
      case NavigationViewKey.LLMProviders:
        return <LLMProvidersPage activeProvider={activeSubView} />;
      case NavigationViewKey.MCP:
        return <ConnectorCatalogPage />;
      case NavigationViewKey.Settings:
        return <SettingsPage />;
    }
  };

  const overflowClassName = activeView === NavigationViewKey.Chat ? ' overflow-x-hidden' : ' overflow-y-auto';

  return (
    <div className="[--header-height:2.25rem] h-screen flex flex-col">
      <Sidebar>
        <SidebarInset className="overflow-hidden h-full">
          <main className={`flex-1 space-y-4 p-4 h-full${overflowClassName}`}>{renderContent()}</main>
        </SidebarInset>
      </Sidebar>
    </div>
  );
}
