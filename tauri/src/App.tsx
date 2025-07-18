import { useState } from "react";
import { useChat } from "./hooks/useChat";
import { useMcpTools } from "./hooks/useMcpTools";
import "./App.css";

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');

  const { tools, isLoading: toolsLoading, hasTools, callTool, error: toolsError } = useMcpTools();

  const { generateResponse, isLoading } = useChat({
    tools,
    callTool,
    onUpdate: (content) => {
      setStreamingContent(content);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setStreamingContent('');

    generateResponse(newMessages, {
      onSuccess: (content) => {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content,
        };
        setMessages([...newMessages, assistantMessage]);
        setStreamingContent('');
      },
      onError: (error) => {
        console.error('Chat error:', error);
        setStreamingContent('');
      },
    });
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>MCP Chat with Ollama</h1>
        <div className="tools-status">
          {toolsLoading ? (
            <span className="loading">Loading MCP tools...</span>
          ) : toolsError ? (
            <span className="no-tools">❌ MCP Error: {toolsError}</span>
          ) : hasTools ? (
            <span className="tools-available">✅ {tools.length} MCP tools available</span>
          ) : (
            <span className="no-tools">⚠️ No MCP tools detected</span>
          )}
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.role === "user" ? "user" : "assistant"}`}
          >
            <div className="message-content">
              <strong>{message.role === "user" ? "You" : "AI"}:</strong>
              <p>{message.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="message-content">
              <strong>AI:</strong>
              <p>{streamingContent || "Thinking..."}</p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="chat-input"
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default App;
