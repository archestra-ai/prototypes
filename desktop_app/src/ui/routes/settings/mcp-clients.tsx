import { createFileRoute } from '@tanstack/react-router';

import ExternalClients from '@ui/pages/SettingsPage/ExternalClients';

export const Route = createFileRoute('/settings/mcp-clients')({
  component: ExternalClients,
});
