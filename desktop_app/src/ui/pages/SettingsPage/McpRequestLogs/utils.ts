export const formatDuration = (durationMs?: number): string => {
  if (!durationMs) return 'N/A';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
};

export const formatTimestamp = (timestamp: string): string => {
  return new Date(timestamp).toLocaleString();
};

export const getStatusColor = (statusCode: number): string => {
  if (statusCode >= 200 && statusCode < 300) return 'text-green-500 dark:text-green-400';
  if (statusCode >= 400 && statusCode < 500) return 'text-yellow-500 dark:text-yellow-400';
  if (statusCode >= 500) return 'text-red-500 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
};

export const getStatusLabel = (statusCode: number): string => {
  if (statusCode >= 200 && statusCode < 300) return 'Success';
  if (statusCode >= 400 && statusCode < 500) return 'Client Error';
  if (statusCode >= 500) return 'Server Error';
  return 'Unknown';
};
