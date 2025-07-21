import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ARCHESTRA_SERVER_URL } from '../consts';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function constructProxiedMCPServerUrl(mcpServerName: string) {
  return `${ARCHESTRA_SERVER_URL}/proxy/${mcpServerName}`;
}
