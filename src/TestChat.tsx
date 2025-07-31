import React from 'react';

export function TestChat({ serverPort }: { serverPort: number }) {
  const [input, setInput] = React.useState('');
  const [messages, setMessages] = React.useState<Array<{role: string, content: string}>>([]);
  const [provider, setProvider] = React.useState('openai');
  
  const sendMessage = async () => {
    if (!input) return;
    
    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    
    const response = await fetch(`http://127.0.0.1:${serverPort}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: newMessages, provider }),
    });
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let text = '';
    
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
      setMessages([...newMessages, { role: 'assistant', content: text }]);
    }
  };
  
  return (
    <div>
      <select value={provider} onChange={(e) => setProvider(e.target.value)}>
        <option value="openai">OpenAI</option>
        <option value="ollama">Ollama</option>
      </select>
      {messages.map((m, i) => (
        <div key={i}>{m.role}: {m.content}</div>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}