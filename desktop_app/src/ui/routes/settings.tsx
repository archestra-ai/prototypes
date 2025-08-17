import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Settings</h2>
        <p className="text-muted-foreground">
          Configure your Archestra AI desktop application settings and manage MCP connections.
        </p>
      </div>
      <Outlet />
    </div>
  ),
});
