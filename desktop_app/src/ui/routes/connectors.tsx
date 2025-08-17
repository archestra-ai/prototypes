import { createFileRoute } from '@tanstack/react-router';
import { Filter, Package, Search } from 'lucide-react';
import { useState } from 'react';

import AlphaDisclaimerMessage from '@ui/components/ConnectorCatalog/AlphaDisclaimerMessage';
import McpServer from '@ui/components/ConnectorCatalog/McpServer';
import McpServerInstallDialog from '@ui/components/ConnectorCatalog/McpServerInstallDialog';
import { Input } from '@ui/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { ArchestraMcpServerManifest } from '@ui/lib/clients/archestra/catalog/gen';
import { useConnectorCatalogStore, useMcpServersStore } from '@ui/stores';
import { type McpServerUserConfigValues } from '@ui/types';

export const Route = createFileRoute('/connectors')({
  component: ConnectorCatalogPage,
});

function ConnectorCatalogPage() {
  const [selectedServerForInstall, setSelectedServerForInstall] = useState<ArchestraMcpServerManifest | null>(null);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  const {
    connectorCatalog,
    connectorCatalogCategories,
    catalogSearchQuery,
    catalogSelectedCategory,
    catalogHasMore,
    catalogTotalCount,
    loadingConnectorCatalog,
    setCatalogSearchQuery,
    setCatalogSelectedCategory,
    loadMoreCatalogServers,
  } = useConnectorCatalogStore();
  const { installedMcpServers, installMcpServer: _installMcpServer, uninstallMcpServer } = useMcpServersStore();

  const installMcpServer = async (
    mcpServer: ArchestraMcpServerManifest,
    userConfigValues?: McpServerUserConfigValues
  ) => {
    _installMcpServer(mcpServer.archestra_config.oauth.required, {
      id: mcpServer.name,
      displayName: mcpServer.display_name,
      /**
       * NOTE: TBD.. should we be sending the entire `mcpServer.server` object here? Is there
       * value in persisting that?
       *
       * https://github.com/anthropics/dxt/blob/main/MANIFEST.md#server-configuration
       */
      serverConfig: mcpServer.server.mcp_config,
      userConfigValues: userConfigValues || {},
    });
  };

  const handleInstallClick = (mcpServer: ArchestraMcpServerManifest) => {
    // If server has user_config, show the dialog
    if (mcpServer.user_config && Object.keys(mcpServer.user_config).length > 0) {
      setSelectedServerForInstall(mcpServer);
      setInstallDialogOpen(true);
    } else {
      // Otherwise, install directly
      installMcpServer(mcpServer);
    }
  };

  const handleInstallWithConfig = async (config: McpServerUserConfigValues) => {
    if (selectedServerForInstall) {
      await installMcpServer(selectedServerForInstall, config);
      setInstallDialogOpen(false);
      setSelectedServerForInstall(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header with search and filters */}
      <div className="space-y-3">
        <div>
          <h1 className="text-3xl font-bold">MCP Server Catalog</h1>
          <p className="text-muted-foreground mt-1">
            Browse and install Model Context Protocol servers to extend your AI capabilities
          </p>
        </div>

        <AlphaDisclaimerMessage />

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search servers..."
              value={catalogSearchQuery}
              onChange={(e) => setCatalogSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={catalogSelectedCategory} onValueChange={setCatalogSelectedCategory}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {connectorCatalogCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {catalogTotalCount > 0 ? (
              <>
                {connectorCatalog.length} of {catalogTotalCount} servers
              </>
            ) : (
              <>
                {connectorCatalog.length} {connectorCatalog.length === 1 ? 'server' : 'servers'}
              </>
            )}
          </p>
          <p className="text-sm text-muted-foreground">{installedMcpServers.length} installed</p>
        </div>
      </div>

      {/* Catalog Grid */}
      {loadingConnectorCatalog && connectorCatalog.length === 0 && (
        <div className="text-center py-16">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50 animate-pulse" />
          <p className="text-muted-foreground">Loading server catalog...</p>
        </div>
      )}

      {!loadingConnectorCatalog && connectorCatalog.length === 0 && (
        <div className="text-center py-16">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No servers found matching your criteria</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {connectorCatalog.map((connectorCatalogMcpServer) => (
          <McpServer
            key={connectorCatalogMcpServer.name}
            server={connectorCatalogMcpServer}
            onInstallClick={handleInstallClick}
            onUninstallClick={uninstallMcpServer}
          />
        ))}
      </div>

      {/* Infinite scroll loader */}
      {catalogHasMore && (
        <div
          ref={(node) => {
            if (!node) return;

            const observer = new IntersectionObserver(
              (entries) => {
                if (entries[0].isIntersecting && !loadingConnectorCatalog) {
                  loadMoreCatalogServers();
                }
              },
              { threshold: 0.1 }
            );

            observer.observe(node);
            return () => observer.disconnect();
          }}
          className="flex justify-center py-8"
        >
          {loadingConnectorCatalog ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span>Loading more servers...</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Scroll to load more</p>
          )}
        </div>
      )}

      {/* Install Dialog */}
      <McpServerInstallDialog
        mcpServer={selectedServerForInstall}
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        onInstall={handleInstallWithConfig}
      />
    </div>
  );
}
