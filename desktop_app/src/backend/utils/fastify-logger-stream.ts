import log from '@backend/utils/logger';

export const electronLogStream = {
  write: (msg: string) => {
    try {
      const obj = JSON.parse(msg);
      const level = obj.level === 30 ? 'info' : obj.level === 40 ? 'warn' : obj.level === 50 ? 'error' : 'debug';

      log[level](`[Server]: ${obj.msg || ''}`, obj);
    } catch (e) {
      // Fallback for non-JSON messages
      log.info(`[Server]: ${msg}`);
    }
  },
};
