import { render } from '@testing-library/react';

import { MCPServerStatus } from '@ui/types';

import ArchestraMCPServer from '.';

describe('ArchestraMCPServer', () => {
  it('renders the ArchestraMCPServer component', () => {
    const mockArchestraMCPServer = {
      id: 1,
      name: 'archestra',
      created_at: new Date().toISOString(),
      server_config: {
        transport: 'http',
        command: '',
        args: [],
        env: {},
      },
      url: 'http://localhost:54587/mcp',
      client: null,
      tools: [],
      status: MCPServerStatus.Connected,
      error: null,
    };
    render(<ArchestraMCPServer archestraMCPServer={mockArchestraMCPServer} />);
  });
});
