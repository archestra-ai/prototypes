import log from 'electron-log/main';
import path from 'path';

import config from '@backend/config';

const logLevel = config.logLevel as typeof log.transports.file.level;

log.transports.file.level = logLevel;
log.transports.console.level = logLevel;

if (config.debug) {
  log.transports.file.resolvePathFn = () => path.join(process.cwd(), 'logs', 'main.log');
}

// log.transports.console.format = '{level} [{time}] {text}';
// log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

export default log;
