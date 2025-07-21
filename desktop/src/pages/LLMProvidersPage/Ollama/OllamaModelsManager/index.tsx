import { useCallback, useState } from 'react';
import {
  Search,
  Download,
  Check,
  Loader2,
  HardDrive,
  Cpu,
  Package,
  ChevronDown,
  RefreshCw,
  Clock,
  Type,
} from 'lucide-react';

import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { ScrollArea } from '../../../../components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../../components/ui/collapsible';
import { useOllamaClient } from '../../../../hooks/llm-providers/ollama/use-ollama-client';

interface OllamaModelsManagerProps {}

export default function OllamaModelsManager({}: OllamaModelsManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(
    undefined,
  );
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(
    new Set(),
  );
  const [downloadProgress, _setDownloadProgress] = useState<
    Record<string, number>
  >({});

  const [isExpanded, setIsExpanded] = useState(false);
  const {
    ollamaClient,
    installedModels,
    loadingInstalledModels,
    availableModels,
    allAvailableModelLabels,
  } = useOllamaClient();

  const filteredModels = availableModels.filter((model) => {
    const matchesSearch =
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.labels.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase()),
      );

    const matchesLabel =
      selectedLabel === undefined || model.labels.includes(selectedLabel);

    return matchesSearch && matchesLabel;
  });

  const isModelInstalled = (modelName: string) => {
    return installedModels.some((model) => model.name === modelName);
  };

  const handleDownloadModel = useCallback(
    async (modelName: string, tag: string) => {
      if (ollamaClient) {
        const fullModelName = `${modelName}:${tag}`;

        setDownloadingModels(new Set([...downloadingModels, fullModelName]));

        // TODO: Handle progress from stream here
        await ollamaClient.pull({
          model: fullModelName,
          stream: true,
        });

        setDownloadingModels((prev) => {
          const newSet = new Set(prev);
          newSet.delete(fullModelName);
          return newSet;
        });
      }
    },
    [ollamaClient],
  );

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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

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
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent>
              {loadingInstalledModels ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto mb-4 animate-spin" />
                  <p className="text-muted-foreground">
                    Loading installed models...
                  </p>
                </div>
              ) : installedModels.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    No Models Installed
                  </h3>
                  <p className="text-muted-foreground">
                    Download some models from the Model Library to get started
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      Total models installed: {installedModels.length}
                    </span>
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
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {tag}
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap gap-4 text-sm">
                                  <div className="flex items-center gap-1">
                                    <HardDrive className="h-3 w-3" />
                                    <span>Size: {formatBytes(model.size)}</span>
                                  </div>
                                  <div>
                                    <span className="font-medium">
                                      Parameters:
                                    </span>{' '}
                                    {modelDetails.parameter_size}
                                  </div>
                                  <div>
                                    <span className="font-medium">
                                      Quantization:
                                    </span>{' '}
                                    {modelDetails.quantization_level}
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

      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ollama Model Library</h1>
          <p className="text-muted-foreground">
            Discover and download AI models from the Ollama library
          </p>
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

          <Tabs
            value={selectedLabel}
            onValueChange={setSelectedLabel}
            className="w-auto"
          >
            <TabsList>
              {allAvailableModelLabels.map((label) => (
                <TabsTrigger key={label} value={label}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <ScrollArea className="h-[600px]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
          {filteredModels.map((model) => (
            <Card
              key={model.name}
              className="hover:shadow-md transition-shadow"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{model.name}</CardTitle>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {model.description}
                </p>
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
                      const isDownloading =
                        downloadingModels.has(fullModelName);
                      const progress = downloadProgress[fullModelName];
                      const isInstalled = isModelInstalled(fullModelName);

                      return (
                        <div key={tag} className="p-3 rounded border space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Cpu className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-mono font-medium">
                                {tag}
                              </span>
                            </div>

                            <Button
                              size="sm"
                              variant={isInstalled ? 'secondary' : 'default'}
                              disabled={isDownloading}
                              onClick={() =>
                                handleDownloadModel(model.name, tag)
                              }
                              className="h-8 px-3"
                            >
                              {isDownloading ? (
                                <div className="flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span className="text-xs">
                                    {progress ? `${progress}%` : '...'}
                                  </span>
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
            <p className="text-muted-foreground">
              Try adjusting your search terms or category filter
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
