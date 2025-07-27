import Sidebar from './components/Sidebar';
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

  // Removed unused overflowClassName variable

  return (
    <div className="[--header-height:2.25rem] h-screen flex flex-col">
      <Sidebar>{renderContent()}</Sidebar>
    </div>
  );
}
