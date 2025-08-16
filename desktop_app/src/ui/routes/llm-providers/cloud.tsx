import { createFileRoute } from '@tanstack/react-router';

import CloudProvidersPage from '@ui/pages/LLMProvidersPage/CloudProviders';

export const Route = createFileRoute('/llm-providers/cloud')({
  component: CloudProvidersPage,
});
