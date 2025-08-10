import {
  CheckCircle,
  Code,
  Database,
  FileText,
  GitFork,
  Globe,
  Info,
  Loader2,
  MessageSquare,
  Package,
  Search,
  Settings,
  Star,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Card, CardContent, CardHeader } from '@ui/components/ui/card';
import { Separator } from '@ui/components/ui/separator';
import { ArchestraMcpServerManifest } from '@ui/lib/clients/archestra/catalog/gen';
import { useMcpServersStore } from '@ui/stores/mcp-servers-store';
import { useSandboxStore } from '@ui/stores/sandbox-store';

import McpServerDetailsDialog from './McpServerDetailsDialog';

interface McpServerProps {
  server: ArchestraMcpServerManifest;
  onInstallClick: (server: ArchestraMcpServerManifest) => void;
  onUninstallClick: (serverId: string) => void;
}

export default function McpServer({ server, onInstallClick, onUninstallClick }: McpServerProps) {
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const { installedMcpServers, installingMcpServerId, uninstallingMcpServerId } = useMcpServersStore();
  const { isInitialized } = useSandboxStore();

  const {
    name,
    display_name,
    server: serverConfig,
    description,
    github_info: gitHubInfo,
    category,
    archestra_config: {
      oauth: { required: requiresOAuthSetup },
    },
    programming_language: programmingLanguage,
    quality_score: qualityScore,
    tools,
    prompts,
    license,
  } = server;

  // Determine installation state
  const isInstalled = installedMcpServers.some((s) => s.id === name);
  const isInstalling = installingMcpServerId === name;
  const isUninstalling = uninstallingMcpServerId === name;

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

  const displayName = display_name || name;

  return (
    <>
      <Card className={`transition-all duration-200 hover:shadow-lg ${isInstalled ? 'ring-2 ring-green-500/20' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {getCategoryIcon(category)}
                <h3 className="font-semibold text-lg truncate" title={displayName}>
                  {displayName}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
            </div>
            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDetailsDialogOpen(true)}
                className="h-8 w-8 p-0 cursor-pointer"
                title="View details"
              >
                <Info className="h-4 w-4" />
              </Button>
              {isInstalled && <CheckCircle className="h-5 w-5 text-green-500" />}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Enhanced Metadata */}
          <div className="flex flex-wrap gap-3 text-xs">
            {gitHubInfo.stars > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Star className="h-3 w-3" />
                <span>{gitHubInfo.stars.toLocaleString()}</span>
              </div>
            )}
            {gitHubInfo.contributors > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{gitHubInfo.contributors}</span>
              </div>
            )}
            {tools && tools.length > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Settings className="h-3 w-3" />
                <span>{tools.length} tools</span>
              </div>
            )}
            {prompts && prompts.length > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                <span>{prompts.length} prompts</span>
              </div>
            )}
          </div>

          {/* Repository info */}
          {gitHubInfo.owner && gitHubInfo.repo && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <GitFork className="h-3 w-3" />
              <span className="truncate" title={`${gitHubInfo.owner}/${gitHubInfo.repo}`}>
                {gitHubInfo.owner}/{gitHubInfo.repo}
              </span>
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {category && (
              <Badge variant="secondary" className="text-xs">
                {category}
              </Badge>
            )}
            {programmingLanguage && (
              <Badge variant="outline" className="text-xs">
                {programmingLanguage}
              </Badge>
            )}
            {license && (
              <Badge variant="outline" className="text-xs">
                {license}
              </Badge>
            )}
            {requiresOAuthSetup && (
              <Badge variant="outline" className="text-xs">
                OAuth
              </Badge>
            )}
            {getQualityBadge(qualityScore)}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex justify-between items-center">
            <div className="text-xs text-muted-foreground">v{server.version}</div>
            <div>
              {!isInitialized ? (
                <Button size="sm" variant="ghost" disabled>
                  <Loader2 className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  Sandbox Initializing...
                </Button>
              ) : isInstalled ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onUninstallClick(name)}
                  disabled={isUninstalling}
                  className="text-destructive hover:text-destructive cursor-pointer"
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
                <Button
                  size="sm"
                  onClick={() => onInstallClick(server)}
                  disabled={isInstalling}
                  className="cursor-pointer"
                >
                  {isInstalling ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                      Installing...
                    </>
                  ) : requiresOAuthSetup ? (
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
          </div>
        </CardContent>
      </Card>

      <McpServerDetailsDialog server={server} open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen} />
    </>
  );
}
