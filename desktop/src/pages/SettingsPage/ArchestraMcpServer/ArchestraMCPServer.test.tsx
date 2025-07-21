import { render } from '@testing-library/react';
import { describe, it } from 'vitest';

import ArchestraMcpServer from './';

describe('ArchestraMcpServer', () => {
  it('renders the ArchestraMcpServer component', () => {
    render(<ArchestraMcpServer />);
  });
});
