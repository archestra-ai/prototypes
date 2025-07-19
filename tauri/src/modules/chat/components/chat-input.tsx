"use client";

import { useState, useEffect } from "react";
import { PaperclipIcon, MicIcon, Settings, ChevronDown, Wrench } from "lucide-react";

import { useFetchOllamaModels } from "../hooks/use-fetch-ollama-models";
import { Badge } from "../../../components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "../../../components/ui/tooltip";

import {
  AIInput,
  AIInputTextarea,
  AIInputToolbar,
  AIInputTools,
  AIInputButton,
  AIInputSubmit,
  AIInputModelSelect,
  AIInputModelSelectTrigger,
  AIInputModelSelectContent,
  AIInputModelSelectItem,
  AIInputModelSelectValue,
} from "../../../components/kibo/ai-input";

interface MCPTool {
  serverName: string;
  tool: {
    name: string;
    description?: string;
    input_schema: any;
  };
}

interface ChatInputProps {
  ollamaPort: number | null;
  clearChatHistory: () => void;
  onSubmit: (message: string, model: string) => Promise<void>;
  disabled: boolean;
  mcpTools: MCPTool[];
  isLoadingTools?: boolean;
}

export function ChatInput({ onSubmit, clearChatHistory, disabled, ollamaPort, mcpTools, isLoadingTools = false }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [status, setStatus] = useState<"submitted" | "streaming" | "ready" | "error">("ready");
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);

  const { data: availableModels = [], isLoading: modelsLoading, isError } = useFetchOllamaModels({ ollamaPort });

  useEffect(() => {
    if (!ollamaPort) {
      setSelectedModel("");
    }
  }, [ollamaPort]);

  useEffect(() => {
    if (availableModels.length > 0 && !selectedModel) {
      setSelectedModel(availableModels[0]);
    }
  }, [availableModels, selectedModel]);

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
    }

    if (!message.trim() || disabled || !selectedModel) {
      return;
    }

    setStatus("submitted");

    try {
      await onSubmit(message.trim(), selectedModel);
      setMessage("");
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setTimeout(() => setStatus("ready"), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newMessage = message.substring(0, start) + "\n" + message.substring(end);
        setMessage(newMessage);

        setTimeout(() => {
          textarea.setSelectionRange(start + 1, start + 1);
        }, 0);
      } else {
        e.preventDefault();
        handleSubmit();
      }
    }
  };

  const handleModelChange = (modelName: string) => {
    setSelectedModel(modelName);
    clearChatHistory();
  };

  // Group tools by server
  const toolsByServer = mcpTools.reduce((acc, tool) => {
    if (!acc[tool.serverName]) {
      acc[tool.serverName] = [];
    }
    acc[tool.serverName].push(tool.tool);
    return acc;
  }, {} as Record<string, Array<{name: string; description?: string; input_schema: any}>>);

  return (
    <div className="space-y-2">
      {/* Tools Menu */}
      {isToolsMenuOpen && (mcpTools.length > 0 || isLoadingTools) && (
        <div className="border rounded-lg p-3 bg-muted/50">
          {isLoadingTools ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">Loading available tools...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Available Tools</span>
                <Badge variant="secondary" className="text-xs">
                  Total: {mcpTools.length}
                </Badge>
              </div>
              {Object.entries(toolsByServer).map(([serverName, tools]) => (
                <Collapsible key={serverName}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{serverName}</span>
                        <Badge variant="outline" className="text-xs">
                          {tools.length} tool{tools.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <ChevronDown className="h-4 w-4 transition-transform" />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-4 space-y-1">
                      {tools.map((tool, idx) => (
                        <TooltipProvider key={idx}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="p-2 hover:bg-muted rounded text-sm cursor-help">
                                <span className="font-mono text-primary">{tool.name}</span>
                                {tool.description && (
                                  <div className="text-muted-foreground text-xs mt-1">
                                    {tool.description}
                                  </div>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <div className="space-y-1">
                                <div className="font-medium">{tool.name}</div>
                                {tool.description && (
                                  <div className="text-sm text-muted-foreground">
                                    {tool.description}
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      )}

      <AIInput onSubmit={handleSubmit} className="bg-inherit">
        <AIInputTextarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to know?"
          disabled={disabled}
          minHeight={48}
          maxHeight={164}
        />
        <AIInputToolbar>
          <AIInputTools>
            <AIInputModelSelect
              value={selectedModel}
              onValueChange={handleModelChange}
              disabled={modelsLoading || isError || !ollamaPort}
            >
              <AIInputModelSelectTrigger>
                <AIInputModelSelectValue
                  placeholder={
                    modelsLoading
                      ? "Loading models..."
                      : isError
                      ? "Error loading models"
                      : availableModels.length === 0
                      ? "No models found"
                      : "Select a model"
                  }
                />
              </AIInputModelSelectTrigger>
              <AIInputModelSelectContent>
                {availableModels.map((model) => (
                  <AIInputModelSelectItem key={model} value={model}>
                    {model}
                  </AIInputModelSelectItem>
                ))}
              </AIInputModelSelectContent>
            </AIInputModelSelect>
            <AIInputButton>
              <PaperclipIcon size={16} />
            </AIInputButton>
            <AIInputButton>
              <MicIcon size={16} />
            </AIInputButton>
            {(mcpTools.length > 0 || isLoadingTools) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AIInputButton
                      onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)}
                      className={isToolsMenuOpen ? "bg-primary/20" : ""}
                    >
                      <Settings size={16} />
                    </AIInputButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>
                      {isLoadingTools ? "Loading tools..." : `${mcpTools.length} tools available`}
                    </span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </AIInputTools>
          <AIInputSubmit status={status} disabled={disabled || !message.trim()} />
        </AIInputToolbar>
      </AIInput>
    </div>
  );
}
