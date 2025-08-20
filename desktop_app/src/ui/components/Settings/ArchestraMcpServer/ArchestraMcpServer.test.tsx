import { render } from '@testing-library/react';

import { ConnectedMcpServer } from '@ui/types';

import ArchestraMcpServer from '.';

describe('ArchestraMcpServer', () => {
  it('renders the ArchestraMcpServer component', () => {
    const mockArchestraMcpServer = {
      id: 'archestra',
      name: 'Archestra.ai',
      createdAt: new Date().toISOString(),
      serverConfig: {
        command: '',
        args: [],
        env: {},
      },
      userConfigValues: {},
      startupPercentage: 100,
      state: 'running',
      message: null,
      error: null,
    } as ConnectedMcpServer;
    render(<ArchestraMcpServer archestraMcpServer={mockArchestraMcpServer} />);
  });
});
