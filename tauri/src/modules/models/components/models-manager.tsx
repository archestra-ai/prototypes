import { useState } from "react";
import { Search, Download, Check, Loader2, HardDrive, Eye, Cpu, Clock } from "lucide-react";

import { useOllamaServer } from "../../chat/contexts/ollama-server-context";
import { useFetchOllamaModels } from "../../chat/hooks/use-fetch-ollama-models";
import { InstalledModelsViewer } from "./installed-models-viewer";
import { OllamaServerCard } from "../../chat/components/ollama-server-card";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";

interface ModelInfo {
  name: string;
  description: string;
  sizes: string[];
  tags: string[];
  category: "latest" | "popular" | "vision" | "code" | "embedding";
  multimodal?: boolean;
  context?: string;
}

const AVAILABLE_MODELS: ModelInfo[] = [
  {
    name: "qwen3",
    description: "Latest generation Qwen model with thinking mode and exceptional reasoning capabilities",
    sizes: ["0.6b", "1.7b", "4b", "8b", "14b", "32b", "30b-a3b", "235b-a22b"],
    tags: ["reasoning", "multilingual", "thinking", "tools"],
    category: "latest",
    context: "128K",
  },
  {
    name: "llama3.3",
    description: "Meta's latest 70B parameter model with improved performance and tool support",
    sizes: ["70b"],
    tags: ["tools", "reasoning", "general"],
    category: "latest",
    context: "128K",
  },
  {
    name: "gemma3",
    description: "Google's capable model running on single GPU with vision capabilities",
    sizes: ["1b", "4b", "12b", "27b"],
    tags: ["vision", "efficient", "google"],
    category: "latest",
    multimodal: true,
    context: "8K",
  },
  {
    name: "deepseek-r1",
    description: "High-performance reasoning model comparable to leading commercial models",
    sizes: ["1.5b", "7b", "14b", "671b"],
    tags: ["reasoning", "logic", "analysis"],
    category: "latest",
    context: "64K",
  },
  {
    name: "qwen2.5vl",
    description: "Flagship vision-language model with exceptional multimodal capabilities",
    sizes: ["3b", "7b", "32b", "72b"],
    tags: ["vision", "multimodal", "documents"],
    category: "vision",
    multimodal: true,
    context: "125K",
  },
  {
    name: "phi4",
    description: "Microsoft's 14B parameter model with state-of-the-art reasoning performance",
    sizes: ["14b"],
    tags: ["microsoft", "reasoning", "compact"],
    category: "popular",
    context: "16K",
  },
  {
    name: "llama3.1",
    description: "Meta's previous flagship model with excellent general capabilities",
    sizes: ["8b", "70b", "405b"],
    tags: ["meta", "general", "established"],
    category: "popular",
    context: "128K",
  },
  {
    name: "codellama",
    description: "Specialized model for code generation and programming tasks",
    sizes: ["7b", "13b", "34b"],
    tags: ["code", "programming", "development"],
    category: "code",
    context: "16K",
  },
  {
    name: "mistral",
    description: "High-quality language model from Mistral AI",
    sizes: ["7b", "8x7b", "8x22b"],
    tags: ["mistral", "general", "efficient"],
    category: "popular",
    context: "32K",
  },
  {
    name: "mixtral",
    description: "Mixture of experts model with excellent performance",
    sizes: ["8x7b", "8x22b"],
    tags: ["moe", "mixtral", "performance"],
    category: "popular",
    context: "32K",
  },
  {
    name: "dolphin-mistral",
    description: "Uncensored and fine-tuned version of Mistral for creative tasks",
    sizes: ["7b"],
    tags: ["uncensored", "creative", "fine-tuned"],
    category: "popular",
    context: "32K",
  },
  {
    name: "nomic-embed-text",
    description: "High-quality text embedding model for semantic search and RAG",
    sizes: ["v1.5"],
    tags: ["embeddings", "search", "rag"],
    category: "embedding",
    context: "8K",
  },
];

interface ModelsManagerProps {}

export function ModelsManager({}: ModelsManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  const { ollamaPort, isOllamaRunning } = useOllamaServer();
  const { data: installedModels = [], refetch: refetchModels } = useFetchOllamaModels({ ollamaPort });

  const filteredModels = AVAILABLE_MODELS.filter((model) => {
    const matchesSearch =
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === "all" || model.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const isModelInstalled = (modelName: string, size?: string) => {
    const fullName = size ? `${modelName}:${size}` : modelName;
    return installedModels.some(
      (installed) =>
        installed === fullName ||
        installed === `${modelName}:latest` ||
        (size === undefined && installed.startsWith(modelName + ":"))
    );
  };

  const handleDownloadModel = async (modelName: string, size?: string) => {
    if (!isOllamaRunning || !ollamaPort) {
      alert("Please start the Ollama server first");
      return;
    }

    const fullModelName = size ? `${modelName}:${size}` : `${modelName}:latest`;
    const downloadId = fullModelName;

    setDownloadingModels((prev) => new Set([...prev, downloadId]));
    setDownloadProgress((prev) => ({ ...prev, [downloadId]: 0 }));

    try {
      const response = await fetch(`http://localhost:${ollamaPort}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: fullModelName,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to download model: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let accumulatedData = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulatedData += decoder.decode(value, { stream: true });
        const lines = accumulatedData.split("\n");

        // Process complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            try {
              const data = JSON.parse(line);

              if (data.total && data.completed) {
                const progress = Math.round((data.completed / data.total) * 100);
                setDownloadProgress((prev) => ({ ...prev, [downloadId]: progress }));
              }

              if (data.status === "success") {
                setDownloadProgress((prev) => ({ ...prev, [downloadId]: 100 }));
                // Refresh the installed models list
                setTimeout(() => {
                  refetchModels();
                }, 1000);
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete lines
            }
          }
        }

        // Keep the last incomplete line
        accumulatedData = lines[lines.length - 1];
      }
    } catch (error) {
      console.error("Download failed:", error);
      alert(`Failed to download ${fullModelName}: ${error}`);
    } finally {
      setDownloadingModels((prev) => {
        const newSet = new Set(prev);
        newSet.delete(downloadId);
        return newSet;
      });

      // Clear progress after a delay
      setTimeout(() => {
        setDownloadProgress((prev) => {
          const newProgress = { ...prev };
          delete newProgress[downloadId];
          return newProgress;
        });
      }, 3000);
    }
  };

  const formatFileSize = (sizeStr: string) => {
    // Convert size strings like "7b", "13b", "70b" to more readable format
    if (sizeStr.endsWith("b")) {
      const num = parseFloat(sizeStr.slice(0, -1));
      if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}T`;
      }
      return `${num}B`;
    }
    return sizeStr;
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "latest":
        return "🚀";
      case "vision":
        return "👁️";
      case "code":
        return "💻";
      case "embedding":
        return "🔍";
      default:
        return "⭐";
    }
  };

  return (
    <div className="space-y-6">
      {/* Ollama Server Status */}
      <OllamaServerCard />
      
      {/* Installed Models Viewer */}
      <InstalledModelsViewer />

      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ollama Model Library</h1>
          <p className="text-muted-foreground">Discover and download AI models from the Ollama library</p>
        </div>

        {!isOllamaRunning && (
          <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800">
            <p className="text-yellow-800 dark:text-yellow-200">
              ⚠️ Ollama server is not running. Start the server to download models.
            </p>
          </div>
        )}

        {/* Search and Filter */}
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

          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-auto">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="latest">Latest</TabsTrigger>
              <TabsTrigger value="popular">Popular</TabsTrigger>
              <TabsTrigger value="vision">Vision</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="embedding">Embedding</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Models Grid */}
      <ScrollArea className="h-[600px]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
          {filteredModels.map((model) => (
            <Card key={model.name} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getCategoryIcon(model.category)}</span>
                    <CardTitle className="text-lg">{model.name}</CardTitle>
                    {model.multimodal && (
                      <Badge variant="secondary" className="text-xs">
                        <Eye className="h-3 w-3 mr-1" />
                        Vision
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{model.description}</p>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Model Info */}
                <div className="flex flex-wrap gap-2">
                  {model.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>

                {model.context && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {model.context} context
                  </div>
                )}

                {/* Available Sizes */}
                <div className="space-y-2">
                  <div className="text-sm font-medium flex items-center gap-1">
                    <HardDrive className="h-4 w-4" />
                    Available Sizes
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {model.sizes.map((size) => {
                      const fullModelName = `${model.name}:${size}`;
                      const isDownloading = downloadingModels.has(fullModelName);
                      const progress = downloadProgress[fullModelName];
                      const isInstalled = isModelInstalled(model.name, size);

                      return (
                        <div key={size} className="flex items-center justify-between p-2 rounded border">
                          <div className="flex items-center gap-2">
                            <Cpu className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm font-mono">{formatFileSize(size)}</span>
                          </div>

                          <Button
                            size="sm"
                            variant={isInstalled ? "secondary" : "default"}
                            disabled={isDownloading || !isOllamaRunning}
                            onClick={() => handleDownloadModel(model.name, size)}
                            className="h-7 w-7"
                          >
                            {isDownloading ? (
                              <div className="flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span className="text-xs">{progress ? `${progress}%` : "..."}</span>
                              </div>
                            ) : isInstalled ? (
                              <div className="flex items-center gap-1">
                                <Check className="h-3 w-3" />
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Download className="h-3 w-3" />
                              </div>
                            )}
                          </Button>
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
    </div>
  );
}
