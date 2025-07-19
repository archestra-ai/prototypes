import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState, useCallback, useEffect } from "react";
import { IChatMessage, ToolCallInfo, MCPTool } from "../types";
import { parseThinkingContent } from "../utils/thinking-parser";
import { markMessageAsCancelled } from "../utils/message-utils";

interface IArgs {
  ollamaPort: number | null;
  mcpTools: MCPTool[];
}

export function usePostChatMessage({ ollamaPort, mcpTools }: IArgs) {
  const [chatHistory, setChatHistory] = useState<IChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [isToolBasedStreaming, setIsToolBasedStreaming] = useState(false);

  // Scroll to bottom when new messages are added or content changes
  useEffect(() => {
    const scrollToBottom = () => {
      // Find the scroll area and scroll to bottom smoothly
      const scrollArea = document.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (scrollArea) {
        scrollArea.scrollTo({
          top: scrollArea.scrollHeight,
          behavior: "smooth",
        });
      }
    };

    // Scroll after a short delay to ensure DOM is updated
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
  }, [chatHistory, streamingMessageId]); // Trigger on both message changes and streaming status

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
          // Continue with state reset even if backend cancellation failed
        }
      } else if (abortController) {
        // Cancel fetch-based streaming
        abortController.abort();
        setAbortController(null);
        console.log("✅ Fetch-based streaming cancelled");
      }

      // Always reset state immediately and clear tool execution states
      setIsChatLoading(false);
      setStreamingMessageId(null);
      setIsToolBasedStreaming(false);

      // Clear any stuck tool execution states from the currently streaming message
      // Don't add cancellation text here - let the event listeners handle that
      setChatHistory((prev) =>
        prev.map((msg) =>
          msg.id === streamingMessageId ||
          msg.isStreaming ||
          msg.isToolExecuting
            ? {
                ...msg,
                isStreaming: false,
                isToolExecuting: false,
                isThinkingStreaming: false,
              }
            : msg,
        ),
      );
    } catch (error) {
      console.error("Failed to cancel streaming:", error);
      // Still reset state even if cancellation failed
      setIsChatLoading(false);
      setStreamingMessageId(null);
      setIsToolBasedStreaming(false);

      // Clear any stuck tool execution states from the currently streaming message
      setChatHistory((prev) =>
        prev.map((msg) =>
          msg.id === streamingMessageId ||
          msg.isStreaming ||
          msg.isToolExecuting
            ? markMessageAsCancelled(msg)
            : msg,
        ),
      );
    }
  }, [abortController, isToolBasedStreaming, streamingMessageId]);

  // Set up streaming event listeners
  useEffect(() => {
    const setupListeners = async () => {
      // Listen for streaming chunks
      const unlistenChunk = await listen("ollama-chunk", (event: any) => {
        const { total_content } = event.payload;

        // Parse thinking content from tool-based streaming
        const parsed = parseThinkingContent(total_content);

        // Update the streaming message in chat history
        setChatHistory((prev) => {
          return prev.map((msg) =>
            msg.id === streamingMessageId && msg.isStreaming
              ? {
                  ...msg,
                  content: parsed.response,
                  thinkingContent: parsed.thinking,
                  isThinkingStreaming: parsed.isThinkingStreaming,
                }
              : msg,
          );
        });
      });

      // Listen for tool results
      const unlistenToolResults = await listen(
        "ollama-tool-results",
        (event: any) => {
          const { tool_results, message } = event.payload;

          if (tool_results && tool_results.length > 0 && streamingMessageId) {
            // Extract tool calls from the message to get server/tool names
            const originalToolCalls = message?.tool_calls || [];

            // Create tool call info from results
            const toolCallsInfo: ToolCallInfo[] = tool_results.map(
              (toolResult: any, index: number) => {
                const toolId = `tool-${Date.now()}-${index}`;

                // Try to match tool result with original tool call to get metadata
                const matchingToolCall = originalToolCalls[index];
                let serverName = "mcp";
                let toolName = `tool-${index + 1}`;
                let toolArguments = {};

                if (matchingToolCall?.function) {
                  const functionName = matchingToolCall.function.name;
                  if (functionName && functionName.includes("_")) {
                    const [server, tool] = functionName.split("_", 2);
                    serverName = server;
                    toolName = tool;
                  }
                  toolArguments = matchingToolCall.function.arguments || {};
                }

                // Extract text content from the complex structure
                let resultContent = "";
                if (toolResult.content) {
                  if (typeof toolResult.content === "string") {
                    resultContent = toolResult.content;
                  } else if (Array.isArray(toolResult.content)) {
                    // Handle array of content objects
                    resultContent = toolResult.content
                      .map((item: any) => item.text || item.content || item)
                      .join("\n");
                  } else if (toolResult.content.text) {
                    resultContent = toolResult.content.text;
                  } else {
                    resultContent = JSON.stringify(toolResult.content, null, 2);
                  }
                } else if (toolResult.result) {
                  resultContent = toolResult.result;
                }

                return {
                  id: toolId,
                  serverName,
                  toolName,
                  arguments: toolArguments,
                  result: resultContent,
                  error: toolResult.error,
                  status: toolResult.error ? "error" : ("completed" as const),
                  executionTime: 0,
                  startTime: new Date(),
                  endTime: new Date(),
                };
              },
            );

            // Update AI message with tool execution info
            setChatHistory((prev) =>
              prev.map((msg) =>
                msg.id === streamingMessageId
                  ? {
                      ...msg,
                      isToolExecuting: false,
                      toolCalls: toolCallsInfo,
                    }
                  : msg,
              ),
            );

            // Add individual tool result messages
            for (const toolResult of tool_results) {
              const toolMessage = {
                id: (Date.now() + Math.random()).toString(),
                role: "tool",
                content: `Tool: ${toolResult.tool_name}\nResult: ${toolResult.result}`,
                timestamp: new Date(),
              };
              setChatHistory((prev) => [...prev, toolMessage]);
            }
          }
        },
      );

      // Listen for completion
      const unlistenComplete = await listen("ollama-complete", (event: any) => {
        const { content } = event.payload;

        // Finalize the streaming message
        setChatHistory((prev) => {
          return prev.map((msg) =>
            msg.id === streamingMessageId && msg.isStreaming
              ? {
                  ...msg,
                  content: content,
                  isStreaming: false,
                  isToolExecuting: false,
                }
              : msg,
          );
        });

        setStreamingMessageId(null);
        setIsChatLoading(false);
        setIsToolBasedStreaming(false);
      });

      // Listen for cancellation
      const unlistenCancelled = await listen("ollama-cancelled", () => {
        console.log("Tool-based streaming cancelled");
        setIsChatLoading(false);
        setStreamingMessageId(null);
        setIsToolBasedStreaming(false);

        // Mark the last message as no longer streaming
        setChatHistory((prev) => {
          return prev.map((msg) =>
            msg.id === streamingMessageId && msg.isStreaming
              ? markMessageAsCancelled(msg)
              : msg,
          );
        });
      });

      return () => {
        unlistenChunk();
        unlistenToolResults();
        unlistenComplete();
        unlistenCancelled();
      };
    };

    const cleanup = setupListeners();
    return () => {
      cleanup.then((fn) => fn());
    };
  }, [streamingMessageId]);

  const sendChatMessage = useCallback(
    async (message: string, model: string) => {
      if (!message.trim() || !ollamaPort) return;

      setIsChatLoading(true);

      const userMsgId = Date.now().toString();
      const userMessage = {
        id: userMsgId,
        role: "user",
        content: message,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, userMessage]);

      const aiMsgId = (Date.now() + 1).toString();
      const aiMessage = {
        id: aiMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };
      setChatHistory((prev) => [...prev, aiMessage]);

      const currentMessage = message;

      try {
        // Check if the model supports tool calling
        const modelSupportsTools =
          model &&
          (model.includes("functionary") ||
            model.includes("mistral") ||
            model.includes("command") ||
            model.includes("qwen") ||
            model.includes("hermes") ||
            model.includes("llama3") ||
            model.includes("llama-3") ||
            model.includes("phi") ||
            model.includes("granite"));

        console.log("🔧 Tool calling debug:", {
          mcpToolsCount: mcpTools.length,
          modelSupportsTools,
          model,
          willUseMcpTools: mcpTools.length > 0 && modelSupportsTools,
        });

        if (mcpTools.length > 0 && modelSupportsTools) {
          console.log(
            "🎯 Using streaming tool-enabled chat with",
            mcpTools.length,
            "tools",
          );

          // Set the streaming message ID and mark as tool-based
          setStreamingMessageId(aiMsgId);
          setIsToolBasedStreaming(true);

          // Mark AI message as tool executing
          setChatHistory((prev) =>
            prev.map((msg) =>
              msg.id === aiMsgId
                ? {
                    ...msg,
                    isToolExecuting: true,
                    content: "",
                  }
                : msg,
            ),
          );

          // Use the streaming tool-enabled chat
          const messages = [
            { role: "user", content: currentMessage, tool_calls: null },
          ];

          await invoke("ollama_chat_with_tools_streaming", {
            port: ollamaPort,
            model: model,
            messages: messages,
          });

          // The response will be handled by the event listeners
        } else {
          console.log(
            "📡 Using streaming chat (tools disabled or model doesn't support tools)",
          );

          // Add warning if tools are available but model doesn't support them
          if (mcpTools.length > 0 && !modelSupportsTools) {
            const warningMessage = {
              id: (Date.now() + Math.random()).toString(),
              role: "system",
              content: `⚠️ MCP tools are available but ${model} doesn't support tool calling. Consider using functionary-small-v3.2 or another tool-enabled model.`,
              timestamp: new Date(),
            };
            setChatHistory((prev) => [...prev, warningMessage]);
          }

          // Set the streaming message ID for non-tool streaming
          setStreamingMessageId(aiMsgId);
          setIsToolBasedStreaming(false);

          // Create new AbortController for this request
          const controller = new AbortController();
          setAbortController(controller);

          // Use streaming Ollama chat with thinking content parsing
          const response = await fetch(
            `http://localhost:${ollamaPort}/api/chat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                model: model,
                messages: [
                  ...chatHistory.map((msg) => ({
                    role: msg.role,
                    content: msg.content,
                  })),
                  { role: "user", content: currentMessage },
                ],
                stream: true,
                options: {
                  temperature: 0.7,
                  top_p: 0.95,
                  top_k: 40,
                  num_predict: 32768,
                },
              }),
            },
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("No response body");
          }

          const decoder = new TextDecoder();
          let accumulatedContent = "";

          while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter((line) => line.trim());

            for (const line of lines) {
              try {
                const data = JSON.parse(line);

                if (data.message?.content) {
                  accumulatedContent += data.message.content;

                  const parsed = parseThinkingContent(accumulatedContent);

                  setChatHistory((prev) =>
                    prev.map((msg) =>
                      msg.id === aiMsgId
                        ? {
                            ...msg,
                            content: parsed.response,
                            thinkingContent: parsed.thinking,
                            isStreaming: !data.done,
                            isThinkingStreaming:
                              parsed.isThinkingStreaming && !data.done,
                          }
                        : msg,
                    ),
                  );
                }

                if (data.done) {
                  setChatHistory((prev) =>
                    prev.map((msg) =>
                      msg.id === aiMsgId
                        ? {
                            ...msg,
                            isStreaming: false,
                            isThinkingStreaming: false,
                          }
                        : msg,
                    ),
                  );
                  setStreamingMessageId(null);
                  setAbortController(null);
                  setIsToolBasedStreaming(false);
                  break;
                }
              } catch (parseError) {
                console.warn("Failed to parse chunk:", line);
              }
            }
          }
        }
      } catch (error: any) {
        // Handle abort specifically
        if (error.name === "AbortError") {
          console.log("Fetch-based streaming cancelled by user");
          setChatHistory((prev) =>
            prev.map((msg) =>
              msg.id === aiMsgId ? markMessageAsCancelled(msg) : msg,
            ),
          );
        } else {
          const errorMsg =
            error instanceof Error
              ? error.message
              : "An unknown error occurred";
          setChatHistory((prev) =>
            prev.map((msg) =>
              msg.id === aiMsgId
                ? {
                    ...msg,
                    content: `Error: ${errorMsg}`,
                    isStreaming: false,
                  }
                : msg,
            ),
          );
        }
        setStreamingMessageId(null);
        setAbortController(null);
        setIsToolBasedStreaming(false);
      }

      setIsChatLoading(false);
    },
    [ollamaPort, mcpTools, chatHistory],
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
