import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { IChatMessage, ToolCallInfo } from "../types";
import { updateMessage, addCancellationText } from "../utils/message-utils";

interface UseStreamingListenersProps {
  streamingMessageId: string | null;
  setChatHistory: React.Dispatch<React.SetStateAction<IChatMessage[]>>;
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsChatLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsToolBasedStreaming: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useStreamingListeners({
  streamingMessageId,
  setChatHistory,
  setStreamingMessageId,
  setIsChatLoading,
  setIsToolBasedStreaming,
}: UseStreamingListenersProps) {
  useEffect(() => {
    const setupListeners = async () => {
      // Listen for streaming chunks
      const unlistenChunk = await listen("ollama-chunk", (event: any) => {
        const { total_content } = event.payload;

        // Update the streaming message in chat history
        setChatHistory((prev) =>
          updateMessage(prev, streamingMessageId!, {
            content: total_content,
          })
        );
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
              }
            );

            // Update AI message with tool execution info
            setChatHistory((prev) =>
              updateMessage(prev, streamingMessageId, {
                isToolExecuting: false,
                toolCalls: toolCallsInfo,
              })
            );

            // Add individual tool result messages
            for (const toolResult of tool_results) {
              const toolMessage: IChatMessage = {
                id: (Date.now() + Math.random()).toString(),
                role: "tool",
                content: `Tool: ${toolResult.tool_name}\nResult: ${toolResult.result}`,
                timestamp: new Date(),
              };
              setChatHistory((prev) => [...prev, toolMessage]);
            }
          }
        }
      );

      // Listen for completion
      const unlistenComplete = await listen("ollama-complete", (event: any) => {
        const { content } = event.payload;

        // Finalize the streaming message
        setChatHistory((prev) =>
          updateMessage(prev, streamingMessageId!, {
            content: content,
            isStreaming: false,
            isToolExecuting: false,
          })
        );

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
        setChatHistory((prev) =>
          updateMessage(prev, streamingMessageId!, {
            isStreaming: false,
            isToolExecuting: false,
            content: addCancellationText(prev.find(msg => msg.id === streamingMessageId)?.content || ""),
          })
        );
      });

      return () => {
        unlistenChunk();
        unlistenToolResults();
        unlistenComplete();
        unlistenCancelled();
      };
    };

    if (streamingMessageId) {
      const cleanup = setupListeners();
      return () => {
        cleanup.then((fn) => fn());
      };
    }
  }, [streamingMessageId, setChatHistory, setStreamingMessageId, setIsChatLoading, setIsToolBasedStreaming]);
}