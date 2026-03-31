/**
 * Structured logger with environment-aware log levels.
 * In production: only error() writes to console.
 * In development: all levels write with a [LEVEL] prefix.
 */

const isProd = import.meta.env.PROD;

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (..._args: unknown[]) => {};

export const logger = {
  debug: isProd ? noop : (...args: unknown[]) => console.log('[DEBUG]', ...args),
  info: isProd ? noop : (...args: unknown[]) => console.log('[INFO]', ...args),
  warn: isProd ? noop : (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error(isProd ? '[ERROR]' : '[ERROR]', ...args),
};
