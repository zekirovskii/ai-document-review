export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const levels: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const isLogLevel = (value: string): value is LogLevel => value in levels;

export const serializeError = (error: unknown) => error instanceof Error
  ? { name: error.name, message: error.message, stack: error.stack }
  : { name: 'UnknownError' };

export const createLogger = (
  service: 'api',
  level: LogLevel = 'info',
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger => {
  const log = (entryLevel: LogLevel, message: string, context: Record<string, unknown> = {}) => {
    if (levels[entryLevel] < levels[level]) return;
    write(JSON.stringify({ timestamp: new Date().toISOString(), level: entryLevel, service, message, ...context }));
  };

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
  };
};
