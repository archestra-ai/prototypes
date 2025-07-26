import Sidebar from './components/Sidebar';
import { SidebarInset } from './components/ui/sidebar';
import ChatPage from './pages/ChatPage';
import ConnectorCatalogPage from './pages/ConnectorCatalogPage';
import LLMProvidersPage from './pages/LLMProvidersPage';
import SettingsPage from './pages/SettingsPage';
import { useNavigationStore } from './stores/navigation-store';
import { useThemeStore } from './stores/theme-store';
import { NavigationViewKey } from './types';

import './index.css';

export default function App() {
  useThemeStore();

  const { activeView, activeSubView } = useNavigationStore();

  const renderContent = () => {
    switch (activeView) {
      case NavigationViewKey.Chat:
        return <ChatPage />;
      case NavigationViewKey.LLMProviders:
        return (
          <div className="p-4">
            <LLMProvidersPage activeProvider={activeSubView} />
          </div>
        );
      case NavigationViewKey.MCP:
        return (
          <div className="p-4">
            <ConnectorCatalogPage />
          </div>
        );
      case NavigationViewKey.Settings:
        return (
          <div className="p-4">
            <SettingsPage />
          </div>
        );
    }
  };

  return (
    <div className="[--header-height:2.25rem] h-screen flex flex-col">
      <Sidebar>
        <SidebarInset className="overflow-hidden">
          <main className="flex-1 space-y-4 overflow-y-auto">{renderContent()}</main>
        </SidebarInset>
      </Sidebar>
    </div>
  );
}
