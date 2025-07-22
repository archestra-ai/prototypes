import {
  CheckCircle,
  Code,
  Database,
  Download,
  FileText,
  Globe,
  MessageSquare,
  Package,
  Search,
  Settings,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConnectorCatalogStore } from '@/stores/connector-catalog-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';

interface ConnectorCatalogPageProps {}

export default function ConnectorCatalogPage(_props: ConnectorCatalogPageProps) {
  const { installedMCPServers } = useMCPServersStore();
  const {
    connectorCatalog,
    loadingConnectorCatalog,
    installingMCPServerName,
    uninstallingMCPServerName,
    installMCPServerFromConnectorCatalog,
    uninstallMCPServer,
  } = useConnectorCatalogStore();

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'documentation':
        return <FileText className="h-5 w-5" />;
      case 'database':
        return <Database className="h-5 w-5" />;
      case 'web':
        return <Globe className="h-5 w-5" />;
      case 'search':
        return <Search className="h-5 w-5" />;
      case 'communication':
        return <MessageSquare className="h-5 w-5" />;
      case 'developer-tools':
        return <Code className="h-5 w-5" />;
      default:
        return <Package className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Connector Catalog
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingConnectorCatalog && (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Loading connector catalog...</p>
            </div>
          )}
          {!loadingConnectorCatalog && connectorCatalog.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {connectorCatalog.map((mcpServer) => {
                const { id, title, description, category, server_config, oauth } = mcpServer;

                const isInstalled = installedMCPServers.some((server) => server.name === title);
                const isInstalling = installingMCPServerName === title;

                return (
                  <Card
                    key={id}
                    className={`transition-all duration-200 hover:shadow-md ${
                      isInstalled ? 'border-green-500/50 bg-green-50/50' : ''
                    }`}
                  >
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              {getCategoryIcon(category)}
                              <h4 className="font-semibold">{title}</h4>
                            </div>
                            <p className="text-sm text-muted-foreground">{description}</p>
                            <div className="flex gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {category.replace('-', ' ')}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {server_config.transport}
                              </Badge>
                              {oauth?.required && (
                                <Badge variant="outline" className="text-xs">
                                  OAuth
                                </Badge>
                              )}
                              {isInstalled && (
                                <Badge
                                  variant="default"
                                  className="text-xs bg-green-500/10 text-green-600 border-green-500/20"
                                >
                                  ✅ Installed
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          {isInstalled ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => uninstallMCPServer(title)}
                              disabled={uninstallingMCPServerName === title}
                              className="flex items-center gap-2"
                            >
                              {uninstallingMCPServerName === title ? (
                                <>
                                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                  Uninstalling...
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-3 w-3" />
                                  Uninstall
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => installMCPServerFromConnectorCatalog(mcpServer)}
                              disabled={isInstalling}
                              className="flex items-center gap-2"
                            >
                              {isInstalling ? (
                                <>
                                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                  Installing...
                                </>
                              ) : oauth?.required ? (
                                <>
                                  <Settings className="h-4 w-4" />
                                  Setup OAuth
                                </>
                              ) : (
                                <>
                                  <Download className="h-4 w-4" />
                                  Install
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
