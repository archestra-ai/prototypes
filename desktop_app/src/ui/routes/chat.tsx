import { createFileRoute } from '@tanstack/react-router';

import ChatPage from '@ui/pages/ChatPage';

export const Route = createFileRoute('/chat')({
  component: ChatPage,
});
