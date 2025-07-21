import { ScrollArea } from "../../../components/ui/scroll-area";
import { AIReasoning, AIReasoningTrigger, AIReasoningContent } from "../../../components/kibo/ai-reasoning";
import { AIResponse } from "../../../components/kibo/ai-response";
import ToolCallIndicator from "../ToolCallIndicator";
import ToolExecutionResult from "../ToolExecutionResult";
import { usePostChatMessage } from "../use-post-chat-message";

import { cn } from "../../../lib/utils";
import { Wrench } from "lucide-react";

interface ChatHistoryProps {}

export default function ChatHistory(_props: ChatHistoryProps) {
  const { chatHistory } = usePostChatMessage();

  return (
    <ScrollArea
        id="chat-scroll-area"
        className="h-96 w-full rounded-md border p-4"
    >
        <div className="space-y-4">
        {chatHistory.map((msg, index) => (
            <div
            key={msg.id || index}
            className={cn(
                "p-3 rounded-lg",
                msg.role === "user"
                ? "bg-primary/10 border border-primary/20 ml-8"
                : msg.role === "assistant"
                ? "bg-secondary/50 border border-secondary mr-8"
                : msg.role === "error"
                ? "bg-destructive/10 border border-destructive/20 text-destructive"
                : msg.role === "system"
                ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-600"
                : msg.role === "tool"
                ? "bg-blue-500/10 border border-blue-500/20 text-blue-600"
                : "bg-muted border",
            )}
            >
            <div className="text-xs font-medium mb-1 opacity-70 capitalize">
                {msg.role}
            </div>
            {msg.role === "user" ? (
                <div className="text-sm whitespace-pre-wrap">
                {msg.content}
                </div>
            ) : msg.role === "assistant" ? (
                <div className="relative">
                {(msg.isToolExecuting || msg.toolCalls) && (
                    <ToolCallIndicator
                    toolCalls={msg.toolCalls || []}
                    isExecuting={!!msg.isToolExecuting}
                    />
                )}

                {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-2 mb-4">
                    {msg.toolCalls.map((toolCall) => (
                        <ToolExecutionResult
                        key={toolCall.id}
                        serverName={toolCall.serverName}
                        toolName={toolCall.toolName}
                        arguments={toolCall.arguments}
                        result={toolCall.result || ""}
                        executionTime={toolCall.executionTime}
                        status={toolCall.error ? "error" : "success"}
                        error={toolCall.error}
                        />
                    ))}
                    </div>
                )}

                {msg.thinkingContent && (
                    <AIReasoning
                    isStreaming={msg.isThinkingStreaming}
                    className="mb-4"
                    >
                    <AIReasoningTrigger />
                    <AIReasoningContent>
                        {msg.thinkingContent}
                    </AIReasoningContent>
                    </AIReasoning>
                )}

                <AIResponse>{msg.content}</AIResponse>

                {(msg.isStreaming || msg.isToolExecuting) && (
                    <div className="flex items-center space-x-2 mt-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <p className="text-muted-foreground text-sm">
                        {msg.isToolExecuting
                        ? "Executing tools..."
                        : "Loading..."}
                    </p>
                    </div>
                )}
                </div>
            ) : msg.role === "tool" ? (
                <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                    <Wrench className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Tool Result
                    </span>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="text-sm whitespace-pre-wrap font-mono">
                    {msg.content}
                    </div>
                </div>
                </div>
            ) : (
                <div className="text-sm whitespace-pre-wrap">
                {msg.content}
                </div>
            )}
            </div>
        ))}
        </div>
    </ScrollArea>
  );
}
