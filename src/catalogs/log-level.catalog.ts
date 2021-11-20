/**
 * Log levels to indicate importance of the logged message wheres every level corresponds to a certain color.
 *
 * A log level or log severity is a piece of information telling how important a given log message is.
 * It is a simple, yet very powerful way of distinguishing log events from each other.
 * If the log levels are used properly in application all you need is to look at the severity first.
 *
 * Please note:
 * - Messages with DEBUG level are only displayed if explicitly enabled.
 */
export const enum LogLevel {
  INFO  = 'info',
  WARN  = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}
