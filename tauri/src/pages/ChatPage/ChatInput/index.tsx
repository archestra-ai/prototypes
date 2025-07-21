"use client";

import { useState, useEffect } from "react";
import { PaperclipIcon, MicIcon, Settings, ChevronDown, Wrench } from "lucide-react";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

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
import { useOllamaClient } from "../../../hooks/llm-providers/ollama/use-ollama-client";
import { useMCPServers } from "../../../hooks/use-mcp-servers";
import { useChat } from "../../../hooks/use-chat";

interface ChatInputProps {}

export default function ChatInput(_props: ChatInputProps) {
  const { installedMCPServers, loadingInstalledMCPServers } = useMCPServers();
  const {
    isChatLoading,
    isStreaming,
    sendChatMessage,
    clearChatHistory,
    cancelStreaming,
  } = useChat();

  const {
    installedModels,
    loadingInstalledModels,
    loadingInstalledModelsError,
    selectedModel,
    setSelectedModel,
  } = useOllamaClient();

  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"submitted" | "streaming" | "ready" | "error">("ready");
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);

  const disabled = isStreaming || isChatLoading;

  useEffect(() => {
    if (isStreaming) {
      setStatus("streaming");
    } else {
      setStatus("ready");
    }
  }, [isStreaming]);

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
    }

    if (!message.trim() || disabled || !selectedModel) {
      return;
    }

    setStatus("submitted");

    try {
      await sendChatMessage(message.trim(), selectedModel);
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
  const toolsByServer = installedMCPServers.reduce((acc, mcpServer) => {
    acc[mcpServer.name] = mcpServer.tools;
    return acc;
  }, {} as Record<string, Tool[]>);
  const totalNumberOfTools = installedMCPServers.reduce((acc, mcpServer) => acc + mcpServer.tools.length, 0);

  return (
    <TooltipProvider>
      <div className="space-y-2">
      {/* Tools Menu */}
      {isToolsMenuOpen && (totalNumberOfTools > 0 || loadingInstalledMCPServers) && (
        <div className="border rounded-lg p-3 bg-muted/50">
          {loadingInstalledMCPServers ? (
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
                  Total: {totalNumberOfTools}
                </Badge>
              </div>
              {Object.entries(toolsByServer).map(([serverName, tools]) => (
                <Collapsible key={serverName}>
                  <CollapsibleTrigger className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{serverName}</span>
                      <Badge variant="outline" className="text-xs">
                        {tools.length} tool{tools.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <ChevronDown className="h-4 w-4 transition-transform" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-4 space-y-1">
                      {tools.map((tool, idx) => (
                        <Tooltip key={idx}>
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
              defaultValue={selectedModel}
              value={selectedModel}
              onValueChange={handleModelChange}
              disabled={loadingInstalledModels || !!loadingInstalledModelsError}
            >
              <AIInputModelSelectTrigger>
                <AIInputModelSelectValue
                  placeholder={
                    loadingInstalledModels
                      ? "Loading models..."
                      : loadingInstalledModelsError
                      ? "Error loading models"
                      : installedModels.length === 0
                      ? "No models found"
                      : "Select a model"
                  }
                />
              </AIInputModelSelectTrigger>
              <AIInputModelSelectContent>
                {installedModels.map((model) => (
                  <AIInputModelSelectItem key={model.name} value={model.name}>
                    {model.name}
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
            {(totalNumberOfTools > 0 || loadingInstalledMCPServers) && (
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
                    {loadingInstalledMCPServers ? "Loading tools..." : `${totalNumberOfTools} tools available`}
                  </span>
                </TooltipContent>
              </Tooltip>
            )}
          </AIInputTools>
          <AIInputSubmit
            status={status}
            disabled={disabled || (!message.trim() && status !== "streaming")}
            onClick={status === "streaming" ? cancelStreaming : undefined}
          />
        </AIInputToolbar>
        </AIInput>
      </div>
    </TooltipProvider>
  );
}
