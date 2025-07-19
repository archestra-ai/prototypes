import { useState, useCallback } from "react";
import { IChatMessage, MCPTool } from "../types";
import { useStreamingListeners } from "./use-streaming-listeners";
import { 
  createUserMessage, 
  createAssistantMessage, 
  createSystemMessage,
  checkModelSupportsTools,
  isSimpleGreeting,
  updateMessage
} from "../utils/message-utils";
import { handleNonToolStreaming } from "../services/non-tool-streaming";
import { handleToolStreaming } from "../services/tool-streaming";
import { invoke } from "@tauri-apps/api/core";

interface IArgs {
  ollamaPort: number | null;
  mcpTools: MCPTool[];
}

export function usePostChatMessage({ ollamaPort, mcpTools }: IArgs) {
  const [chatHistory, setChatHistory] = useState<IChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isToolBasedStreaming, setIsToolBasedStreaming] = useState(false);

  // Set up streaming event listeners
  useStreamingListeners({
    streamingMessageId,
    setChatHistory,
    setStreamingMessageId,
    setIsChatLoading,
    setIsToolBasedStreaming,
  });

  const clearChatHistory = useCallback(() => {
    setChatHistory([]);
  }, []);

  const cancelStreaming = useCallback(async () => {
    try {
      console.log("🛑 Cancelling streaming, tool-based:", isToolBasedStreaming);

      if (isToolBasedStreaming) {
        // Cancel tool-based streaming
        try {
          await invoke("cancel_ollama_streaming");
          console.log("✅ Tool-based streaming cancellation successful");
        } catch (error) {
          console.warn("⚠️ Tool-based streaming cancellation failed:", error);
        }
      } else if (abortController) {
        // Cancel fetch-based streaming
        abortController.abort();
        setAbortController(null);
        console.log("✅ Fetch-based streaming cancelled");
      }

      // Always reset state immediately
      setIsChatLoading(false);
      setStreamingMessageId(null);
      setIsToolBasedStreaming(false);
    } catch (error) {
      console.error("Failed to cancel streaming:", error);
      // Still reset state even if cancellation failed
      setIsChatLoading(false);
      setStreamingMessageId(null);
      setIsToolBasedStreaming(false);
    }
  }, [abortController, isToolBasedStreaming]);

  const sendChatMessage = useCallback(
    async (message: string, model: string) => {
      if (!message.trim() || !ollamaPort) return;

      setIsChatLoading(true);

      // Create user message
      const userMessage = createUserMessage(message);
      setChatHistory((prev) => [...prev, userMessage]);

      // Create AI message
      const aiMessage = createAssistantMessage();
      setChatHistory((prev) => [...prev, aiMessage]);

      try {
        const modelSupportsTools = checkModelSupportsTools(model);
        const shouldUseTools = mcpTools.length > 0 && modelSupportsTools && !isSimpleGreeting(message);

        console.log("🔧 Tool calling debug:", {
          mcpToolsCount: mcpTools.length,
          modelSupportsTools,
          model,
          isSimpleGreeting: isSimpleGreeting(message),
          shouldUseTools,
        });

        if (shouldUseTools) {
          console.log("🎯 Using streaming tool-enabled chat with", mcpTools.length, "tools");

          // Set the streaming message ID and mark as tool-based
          setStreamingMessageId(aiMessage.id);
          setIsToolBasedStreaming(true);

          await handleToolStreaming({
            ollamaPort,
            model,
            message,
            aiMsgId: aiMessage.id,
            onUpdate: setChatHistory,
          });
        } else {
          console.log("📡 Using streaming chat (tools disabled or model doesn't support tools)");

          // Add warning if tools are available but model doesn't support them
          if (mcpTools.length > 0 && !modelSupportsTools) {
            const warningMessage = createSystemMessage(
              `⚠️ MCP tools are available but ${model} doesn't support tool calling. Consider using functionary-small-v3.2 or another tool-enabled model.`
            );
            setChatHistory((prev) => [...prev, warningMessage]);
          }

          // Set the streaming message ID for non-tool streaming
          setStreamingMessageId(aiMessage.id);
          setIsToolBasedStreaming(false);

          // Create new AbortController for this request
          const controller = new AbortController();
          setAbortController(controller);

          await handleNonToolStreaming({
            ollamaPort,
            model,
            messages: [
              ...chatHistory.map((msg) => ({
                role: msg.role,
                content: msg.content,
              })),
              { role: "user", content: message },
            ],
            aiMsgId: aiMessage.id,
            abortSignal: controller.signal,
            onUpdate: setChatHistory,
            onComplete: () => {
              setStreamingMessageId(null);
              setAbortController(null);
              setIsToolBasedStreaming(false);
            },
            onError: (error) => {
              const errorMsg = error instanceof Error ? error.message : "An unknown error occurred";
              setChatHistory((prev) =>
                updateMessage(prev, aiMessage.id, {
                  content: `Error: ${errorMsg}`,
                  isStreaming: false,
                })
              );
              setStreamingMessageId(null);
              setAbortController(null);
              setIsToolBasedStreaming(false);
            },
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "An unknown error occurred";
        setChatHistory((prev) =>
          updateMessage(prev, aiMessage.id, {
            content: `Error: ${errorMsg}`,
            isStreaming: false,
          })
        );
        setStreamingMessageId(null);
        setAbortController(null);
        setIsToolBasedStreaming(false);
      }

      setIsChatLoading(false);
    },
    [ollamaPort, mcpTools, chatHistory]
  );

  const isStreaming = streamingMessageId !== null;

  return {
    chatHistory,
    isChatLoading,
    isStreaming,
    sendChatMessage,
    clearChatHistory,
    cancelStreaming,
  };
}