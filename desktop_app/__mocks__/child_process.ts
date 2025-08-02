import { EventEmitter } from 'events';
import { vi } from 'vitest';

export const spawn = vi.fn(() => {
  const mockProcess = new EventEmitter() as any;
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.kill = vi.fn();

  return mockProcess;
});
