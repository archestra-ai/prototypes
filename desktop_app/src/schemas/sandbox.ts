import { z } from 'zod';

export const PodmanMachineStatusSchema = z.enum(['not_installed', 'stopped', 'running', 'initializing']);
