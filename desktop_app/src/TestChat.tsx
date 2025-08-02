'use client';

import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { useState } from 'react';

export function TestChat({ serverPort }: { serverPort: number }) {
  const [provider, setProvider] = useState('openai');
  
  const { messages, input, handleInputChange, handleSubmit, addToolResult } = useChat({
    api: `http://localhost:${serverPort}/api/chat`,
    
    body: {
      provider
    },

    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

    // run client-side tools that are automatically executed:
    async onToolCall({ toolCall }) {
      if (toolCall.toolName === 'getLocation') {
        const cities = ['New York', 'Los Angeles', 'Chicago', 'San Francisco'];

        // No await - avoids potential deadlocks
        addToolResult({
          tool: 'getLocation',
          toolCallId: toolCall.toolCallId,
          output: cities[Math.floor(Math.random() * cities.length)],
        });
      }
    },
  });

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>Test Chat with Tool Support</h2>
      <div style={{ marginBottom: '10px' }}>
        <label style={{ marginRight: '10px' }}>Provider:</label>
        <select 
          value={provider} 
          onChange={(e) => setProvider(e.target.value)}
          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama</option>
        </select>
      </div>
      <div style={{ marginBottom: '20px', minHeight: '200px', border: '1px solid #eee', padding: '10px', borderRadius: '4px' }}>
        {messages?.map(message => (
        <div key={message.id}>
          <strong>{`${message.role}: `}</strong>
          {message.parts.map(part => {
            switch (part.type) {
              // render text parts as simple text:
              case 'text':
                return part.text;

              // for tool parts, use the typed tool part names:
              case 'tool-askForConfirmation': {
                const callId = part.toolCallId;

                switch (part.state) {
                  case 'input-streaming':
                    return (
                      <div key={callId}>Loading confirmation request...</div>
                    );
                  case 'input-available':
                    return (
                      <div key={callId}>
                        {part.input.message}
                        <div>
                          <button
                            onClick={() =>
                              addToolResult({
                                tool: 'askForConfirmation',
                                toolCallId: callId,
                                output: 'Yes, confirmed.',
                              })
                            }
                          >
                            Yes
                          </button>
                          <button
                            onClick={() =>
                              addToolResult({
                                tool: 'askForConfirmation',
                                toolCallId: callId,
                                output: 'No, denied',
                              })
                            }
                          >
                            No
                          </button>
                        </div>
                      </div>
                    );
                  case 'output-available':
                    return (
                      <div key={callId}>
                        Location access allowed: {part.output}
                      </div>
                    );
                  case 'output-error':
                    return <div key={callId}>Error: {part.errorText}</div>;
                }
                break;
              }

              case 'tool-getLocation': {
                const callId = part.toolCallId;

                switch (part.state) {
                  case 'input-streaming':
                    return (
                      <div key={callId}>Preparing location request...</div>
                    );
                  case 'input-available':
                    return <div key={callId}>Getting location...</div>;
                  case 'output-available':
                    return <div key={callId}>Location: {part.output}</div>;
                  case 'output-error':
                    return (
                      <div key={callId}>
                        Error getting location: {part.errorText}
                      </div>
                    );
                }
                break;
              }

              case 'tool-getWeatherInformation': {
                const callId = part.toolCallId;

                switch (part.state) {
                  // example of pre-rendering streaming tool inputs:
                  case 'input-streaming':
                    return (
                      <pre key={callId}>{JSON.stringify(part, null, 2)}</pre>
                    );
                  case 'input-available':
                    return (
                      <div key={callId}>
                        Getting weather information for {part.input.city}...
                      </div>
                    );
                  case 'output-available':
                    return (
                      <div key={callId}>
                        Weather in {part.input.city}: {part.output}
                      </div>
                    );
                  case 'output-error':
                    return (
                      <div key={callId}>
                        Error getting weather for {part.input.city}:{' '}
                        {part.errorText}
                      </div>
                    );
                }
                break;
              }
            }
          })}
          <br />
        </div>
      ))}
      </div>
      <form
        onSubmit={handleSubmit}
        style={{ marginTop: '20px' }}
      >
        <input 
          value={input} 
          onChange={handleInputChange}
          placeholder="Type a message..."
          style={{ 
            padding: '8px', 
            marginRight: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            width: '300px'
          }}
        />
        <button 
          type="submit"
          style={{
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
