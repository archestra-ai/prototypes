import { createFileRoute } from '@tanstack/react-router';

import ConnectorCatalogPage from '@ui/pages/ConnectorCatalogPage';

export const Route = createFileRoute('/connectors')({
  component: ConnectorCatalogPage,
});
