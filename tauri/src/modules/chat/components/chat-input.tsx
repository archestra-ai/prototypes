"use client";

import { useState, useEffect } from "react";
import { PaperclipIcon, MicIcon } from "lucide-react";

import { useFetchOllamaModels } from "../hooks/use-fetch-ollama-models";

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

interface ChatInputProps {
  ollamaPort: number | null;
  clearChatHistory: () => void;
  onSubmit: (message: string, model: string) => Promise<void>;
  onStop?: () => void;
  disabled: boolean;
  isStreaming?: boolean;
}

export function ChatInput({ onSubmit, clearChatHistory, disabled, ollamaPort, onStop, isStreaming }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [status, setStatus] = useState<"submitted" | "streaming" | "ready" | "error">("ready");

  const { data: availableModels = [], isLoading: modelsLoading, isError } = useFetchOllamaModels({ ollamaPort });

  useEffect(() => {
    if (!ollamaPort) {
      setSelectedModel("");
    }
  }, [ollamaPort]);

  useEffect(() => {
    if (isStreaming) {
      setStatus("streaming");
    } else {
      setStatus("ready");
    }
  }, [isStreaming]);

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

  return (
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
        </AIInputTools>
        <AIInputSubmit 
          status={status} 
          disabled={disabled || (!message.trim() && status !== "streaming")}
          onClick={status === "streaming" ? onStop : undefined}
        />
      </AIInputToolbar>
    </AIInput>
  );
}
