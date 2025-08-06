export const PODMAN_MACHINE_STATUSES = ['not_installed', 'stopped', 'running', 'initializing'] as const;
export type PodmanMachineStatus = typeof PODMAN_MACHINE_STATUSES[number];
