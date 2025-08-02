import Sidebar from './components/Sidebar';
import { SidebarInset } from './components/ui/sidebar';
import ChatPage from './pages/ChatPage';
import ConnectorCatalogPage from './pages/ConnectorCatalogPage';
import LLMProvidersPage from './pages/LLMProvidersPage';
import SettingsPage from './pages/SettingsPage';
import { useNavigationStore } from './stores/navigation-store';
import { NavigationViewKey } from './types';

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
