import { PodmanMachineStatusSchema } from '@archestra/schemas';
import { z } from 'zod';

export type PodmanMachineStatus = z.infer<typeof PodmanMachineStatusSchema>;
