import { useEffect } from 'react';

import { useSSEChat } from '@/hooks/use-sse-chat';

export function DebugChat() {
  const chat = useSSEChat();

  useEffect(() => {
    console.log('[DebugChat] Chat state:', {
      messages: chat.messages,
      messagesLength: chat.messages.length,
      status: chat.status,
      error: chat.error,
      isLoading: chat.isLoading,
    });
  }, [chat.messages, chat.status, chat.error, chat.isLoading]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        background: 'black',
        color: 'white',
        padding: 10,
        fontSize: 12,
        zIndex: 9999,
      }}
    >
      <div>Messages: {chat.messages.length}</div>
      <div>Status: {chat.status}</div>
      <div>Error: {chat.error?.message || 'none'}</div>
    </div>
  );
}
