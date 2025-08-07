import {
  CheckCircle,
  Code,
  Database,
  FileText,
  Filter,
  GitFork,
  Globe,
  MessageSquare,
  Package,
  Search,
  Settings,
  Star,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { ArchestraMcpServerManifest } from '@clients/archestra/catalog/gen';
import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Card, CardContent, CardHeader } from '@ui/components/ui/card';
import { Input } from '@ui/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { Separator } from '@ui/components/ui/separator';
import { useMcpServersStore } from '@ui/stores/mcp-servers-store';

import McpServerInstallDialog from './McpServerInstallDialog';

interface ConnectorCatalogPageProps {}

export default function ConnectorCatalogPage(_props: ConnectorCatalogPageProps) {
  const [selectedServerForInstall, setSelectedServerForInstall] = useState<ArchestraMcpServerManifest | null>(null);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  const {
    connectorCatalog,
    connectorCatalogCategories,
    catalogSearchQuery,
    catalogSelectedCategory,
    catalogHasMore,
    catalogTotalCount,
    installedMcpServers,
    loadingConnectorCatalog,
    installingMcpServerSlug,
    uninstallingMcpServerSlug,
    installMcpServerFromConnectorCatalog,
    uninstallMcpServer,
    setCatalogSearchQuery,
    setCatalogSelectedCategory,
    loadMoreCatalogServers,
  } = useMcpServersStore();

  const getCategoryIcon = (category?: string | null) => {
    if (!category) return <Package className="h-4 w-4" />;

    switch (category) {
      case 'Development':
      case 'CLI Tools':
      case 'Developer Tools':
        return <Code className="h-4 w-4" />;
      case 'Data':
      case 'Data Science':
      case 'Database':
        return <Database className="h-4 w-4" />;
      case 'File Management':
      case 'Knowledge':
        return <FileText className="h-4 w-4" />;
      case 'Browser Automation':
      case 'Web':
        return <Globe className="h-4 w-4" />;
      case 'Search':
        return <Search className="h-4 w-4" />;
      case 'Communication':
      case 'Social Media':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getQualityBadge = (score?: number | null) => {
    if (!score) return null;

    if (score >= 80) {
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Excellent</Badge>;
    } else if (score >= 60) {
      return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Good</Badge>;
    } else {
      return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">Fair</Badge>;
    }
  };

  const handleInstallClick = (mcpServer: ArchestraMcpServerManifest) => {
    // If server has user_config, show the dialog
    if (mcpServer.user_config && Object.keys(mcpServer.user_config).length > 0) {
      setSelectedServerForInstall(mcpServer);
      setInstallDialogOpen(true);
    } else {
      // Otherwise, install directly
      installMcpServerFromConnectorCatalog(mcpServer);
    }
  };

  const handleInstallWithConfig = async (config: ArchestraMcpServerManifest) => {
    if (selectedServerForInstall) {
      await installMcpServerFromConnectorCatalog(selectedServerForInstall, config);
      setInstallDialogOpen(false);
      setSelectedServerForInstall(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with search and filters */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">MCP Server Catalog</h1>
          <p className="text-muted-foreground mt-1">
            Browse and install Model Context Protocol servers to extend your AI capabilities
          </p>
        </div>

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
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              {connectorCatalogCategories.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
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

      {connectorCatalog.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {connectorCatalog.map((mcpServer) => {
              const isInstalled = installedMcpServers.some((server) => server.slug === mcpServer.slug);
              const isInstalling = installingMcpServerSlug === mcpServer.slug;
              const isUninstalling = uninstallingMcpServerSlug === mcpServer.slug;

              return (
                <Card
                  key={mcpServer.slug}
                  className={`transition-all duration-200 hover:shadow-lg ${
                    isInstalled ? 'ring-2 ring-green-500/20' : ''
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getCategoryIcon(mcpServer.category)}
                          <h3 className="font-semibold text-lg">{mcpServer.name}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{mcpServer.description}</p>
                      </div>
                      {isInstalled && <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 ml-2" />}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Metadata */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {mcpServer.gh_stars !== undefined && mcpServer.gh_stars > 0 && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Star className="h-3 w-3" />
                          <span>{mcpServer.gh_stars.toLocaleString()}</span>
                        </div>
                      )}
                      {mcpServer.gh_contributors !== undefined && mcpServer.gh_contributors > 0 && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Users className="h-3 w-3" />
                          <span>{mcpServer.gh_contributors}</span>
                        </div>
                      )}
                      {mcpServer.gitHubOrg && mcpServer.gitHubRepo && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <GitFork className="h-3 w-3" />
                          <span>
                            {mcpServer.gitHubOrg}/{mcpServer.gitHubRepo}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5">
                      {mcpServer.category && (
                        <Badge variant="secondary" className="text-xs">
                          {mcpServer.category}
                        </Badge>
                      )}
                      {mcpServer.programmingLanguage && (
                        <Badge variant="outline" className="text-xs">
                          {mcpServer.programmingLanguage}
                        </Badge>
                      )}
                      {mcpServer.configForArchestra?.transport && (
                        <Badge variant="outline" className="text-xs">
                          {mcpServer.configForArchestra.transport}
                        </Badge>
                      )}
                      {mcpServer.configForArchestra?.oauth?.required && (
                        <Badge variant="outline" className="text-xs">
                          OAuth
                        </Badge>
                      )}
                      {getQualityBadge(mcpServer.qualityScore)}
                    </div>

                    <Separator />

                    {/* Actions */}
                    <div className="flex justify-end">
                      {isInstalled ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => uninstallMcpServer(mcpServer.name)}
                          disabled={isUninstalling}
                          className="text-destructive hover:text-destructive"
                        >
                          {isUninstalling ? (
                            <>
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                              Uninstalling...
                            </>
                          ) : (
                            'Uninstall'
                          )}
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => handleInstallClick(mcpServer)} disabled={isInstalling}>
                          {isInstalling ? (
                            <>
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                              Installing...
                            </>
                          ) : mcpServer.configForArchestra?.oauth?.required ? (
                            <>
                              <Settings className="h-4 w-4 mr-2" />
                              Setup & Install
                            </>
                          ) : (
                            'Install'
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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
        </>
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
