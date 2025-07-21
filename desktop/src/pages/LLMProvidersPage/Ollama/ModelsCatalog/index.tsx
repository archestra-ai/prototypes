import { Check, Clock, Cpu, Download, HardDrive, Loader2, Search, Type } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAllAvailableModelLabels, useAvailableModels, useOllamaStore } from '@/stores/ollama-store';

interface ModelsCatalogProps {}

export default function ModelsCatalog({}: ModelsCatalogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string>('all');

  const { installedModels, downloadModel, downloadProgress, modelsBeingDownloaded } = useOllamaStore();

  const availableModels = useAvailableModels();
  const allAvailableModelLabels = useAllAvailableModelLabels();

  const filteredModels = availableModels.filter((model) => {
    const matchesSearch =
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.labels.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesLabel = selectedLabel === 'all' || model.labels.includes(selectedLabel);

    return matchesSearch && matchesLabel;
  });

  const isModelInstalled = (modelName: string) => {
    return installedModels.some((model) => model.name === modelName);
  };

  const formatFileSize = (sizeStr: string) => {
    // Convert size strings like "7b", "13b", "70b" to more readable format
    if (sizeStr.endsWith('b')) {
      const num = parseFloat(sizeStr.slice(0, -1));
      if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}T`;
      }
      return `${num}B`;
    }
    return sizeStr;
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ollama Model Library</h1>
          <p className="text-muted-foreground">Discover and download AI models from the Ollama library</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search models by name, description, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={selectedLabel} onValueChange={setSelectedLabel}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {allAvailableModelLabels.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="h-[600px]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
          {filteredModels.map((model) => (
            <Card key={model.name} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{model.name}</CardTitle>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{model.description}</p>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {model.labels.map((label) => (
                    <Badge key={label} variant="outline" className="text-xs">
                      {label}
                    </Badge>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium flex items-center gap-1">
                    <HardDrive className="h-4 w-4" />
                    Available Sizes
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {model.tags.map(({ tag, context, size, inputs }) => {
                      const fullModelName = `${model.name}:${tag}`;
                      const progress = downloadProgress[fullModelName];
                      const isDownloading = modelsBeingDownloaded.has(fullModelName);
                      const isInstalled = isModelInstalled(fullModelName);

                      return (
                        <div key={tag} className="p-3 rounded border space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Cpu className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-mono font-medium">{tag}</span>
                            </div>

                            <Button
                              size="sm"
                              variant={isInstalled ? 'secondary' : 'default'}
                              disabled={isDownloading}
                              onClick={() => downloadModel(fullModelName)}
                              className="h-8 px-3"
                            >
                              {isDownloading ? (
                                <div className="flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span className="text-xs">{progress ? `${progress}%` : '...'}</span>
                                </div>
                              ) : isInstalled ? (
                                <div className="flex items-center gap-1">
                                  <Check className="h-3 w-3" />
                                  <span className="text-xs">Installed</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Download className="h-3 w-3" />
                                  <span className="text-xs">Download</span>
                                </div>
                              )}
                            </Button>
                          </div>

                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            {size && (
                              <div className="flex items-center gap-1">
                                <HardDrive className="h-3 w-3" />
                                <span>{formatFileSize(size)}</span>
                              </div>
                            )}
                            {context && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{context} context</span>
                              </div>
                            )}
                            {inputs && inputs.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Type className="h-3 w-3" />
                                <span>Inputs: {inputs.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredModels.length === 0 && (
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No models found</h3>
            <p className="text-muted-foreground">Try adjusting your search terms or category filter</p>
          </div>
        )}
      </ScrollArea>
    </>
  );
}
