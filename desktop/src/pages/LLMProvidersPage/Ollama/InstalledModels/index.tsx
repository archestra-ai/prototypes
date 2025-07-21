import { ChevronDown, HardDrive, Package, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useOllamaStore } from '@/stores/ollama-store';

export const formatBytes = (bytes: number) => {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface InstalledModelsProps {}

export default function InstalledModels({}: InstalledModelsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { installedModels, loadingInstalledModels } = useOllamaStore();

  const parseModelName = (fullName: string) => {
    const parts = fullName.split(':');
    return {
      name: parts[0],
      tag: parts[1] || 'latest',
    };
  };

  return (
    <div className="space-y-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  <CardTitle>Currently Installed Models</CardTitle>
                  {!isExpanded && (
                    <div className="flex items-center gap-2 ml-2">
                      <Badge variant="outline" className="text-xs">
                        {installedModels.length} model
                        {installedModels.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent>
              {loadingInstalledModels ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto mb-4 animate-spin" />
                  <p className="text-muted-foreground">Loading installed models...</p>
                </div>
              ) : installedModels.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Models Installed</h3>
                  <p className="text-muted-foreground">Download some models from the Model Library to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Total models installed: {installedModels.length}</span>
                  </div>

                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {installedModels.map((model) => {
                        const fullModelName = model.name;
                        const { name, tag } = parseModelName(fullModelName);
                        const modelDetails = model.details;

                        return (
                          <div
                            key={fullModelName}
                            className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold">{name}</h3>
                                  <Badge variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap gap-4 text-sm">
                                  <div className="flex items-center gap-1">
                                    <HardDrive className="h-3 w-3" />
                                    <span>Size: {formatBytes(model.size)}</span>
                                  </div>
                                  <div>
                                    <span className="font-medium">Parameters:</span> {modelDetails.parameter_size}
                                  </div>
                                  <div>
                                    <span className="font-medium">Quantization:</span> {modelDetails.quantization_level}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
