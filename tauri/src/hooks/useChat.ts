import { useMutation } from '@tanstack/react-query';
import { streamText } from 'ai';
import { ollama } from 'ollama-ai-provider';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface UseChatOptions {
  onUpdate?: (content: string) => void;
  tools?: any[];
  callTool?: (name: string, arguments_: Record<string, any>) => Promise<any>;
}

const SYSTEM_PROMPT = `You are an AI assistant that can only use MCP (Model Context Protocol) tools. You must ONLY respond by calling available MCP tools. 

Rules:
1. If no MCP tools are available, respond with exactly "No tools"
2. You cannot provide general responses or conversation
3. You must use the available MCP tools to fulfill user requests
4. Always call the most appropriate tool for the user's request`;

export function useChat(options: UseChatOptions = {}) {
  const { onUpdate, tools = [], callTool } = options;

  const generateResponseMutation = useMutation({
    mutationFn: async (messages: Message[]) => {
      // Check if tools are available
      if (!tools || tools.length === 0) {
        onUpdate?.("No tools");
        return "No tools";
      }

      // Add system prompt as first message
      const systemMessage: Message = {
        id: 'system',
        role: 'system',
        content: SYSTEM_PROMPT,
      };

      const allMessages = [systemMessage, ...messages].map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      // Convert tools to AI SDK format
      const aiTools = tools.reduce((acc, tool) => {
        acc[tool.name] = {
          description: tool.description,
          parameters: tool.parameters,
          execute: async (params: Record<string, any>) => {
            if (callTool) {
              return await callTool(tool.name, params);
            }
            throw new Error('Tool execution not available');
          },
        };
        return acc;
      }, {} as Record<string, any>);

      const result = await streamText({
        model: ollama('llama3.2'),
        messages: allMessages,
        tools: aiTools,
        toolChoice: 'auto',
      });

      let fullContent = '';
      
      for await (const delta of result.textStream) {
        fullContent += delta;
        onUpdate?.(fullContent);
      }

      return fullContent;
    },
  });

  return {
    generateResponse: generateResponseMutation.mutate,
    isLoading: generateResponseMutation.isPending,
    error: generateResponseMutation.error,
  };
}