import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/llm-providers')({
  component: () => <Outlet />,
});
