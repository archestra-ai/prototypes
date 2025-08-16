import { createFileRoute } from '@tanstack/react-router';

import OllamaProviderPage from '@ui/pages/LLMProvidersPage/Ollama';

export const Route = createFileRoute('/llm-providers/ollama')({
  component: OllamaProviderPage,
});
