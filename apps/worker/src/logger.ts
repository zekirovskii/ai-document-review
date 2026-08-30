export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const levels: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const createLogger = (
  service: 'worker',
  level: LogLevel = 'info',
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger => {
  const selectedLevel = levels[level] === undefined ? 'info' : level;
  const log = (entryLevel: LogLevel, message: string, context: Record<string, unknown> = {}) => {
    if (levels[entryLevel] < levels[selectedLevel]) return;
    write(JSON.stringify({ timestamp: new Date().toISOString(), level: entryLevel, service, message, ...context }));
  };

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
  };
};
