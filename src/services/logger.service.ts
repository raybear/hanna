import util from 'util';
import chalk from 'chalk';

import {LogLevel} from '../catalogs/log-level.catalog';

/**
 * Represents a logging device which can be used directly as a function (for INFO logging)
 * but also has dedicated logging functions for respective logging levels.
 */
export interface Logging {
  prefix: string | undefined;
  (message: string, ...parameters: any[]): void;

  info(message: string, ...parameters: any[]): void;
  warn(message: string, ...parameters: any[]): void;
  error(message: string, ...parameters: any[]): void;
  debug(message: string, ...parameters: any[]): void;
  log(level: LogLevel, message: string, ...parameters: any[]): void;
}

export class Logger {
  public static readonly internal = new Logger();

  // Global cache of logger instances by plugin name
  private static readonly loggerCache = new Map<string, Logging>();
  private static debugEnabled         = false;
  private static timestampEnabled     = true;

  readonly prefix?: string;

  constructor(prefix?: string) {
    this.prefix = prefix;
  }

  /**
   * Creates a new Logging device with a specified prefix.
   * @param prefix {string} - the prefix of the logger
   */
  static withPrefix(prefix: string): Logging {
    const cachedLogger = Logger.loggerCache.get(prefix);

    if (cachedLogger) {
      return cachedLogger;
    } else {
      const logger = new Logger(prefix);
      const log: any = logger.info.bind(logger);

      log.info  = logger.info;
      log.warn  = logger.warn;
      log.error = logger.error;
      log.debug = logger.debug;
      log.log   = logger.log;

      log.prefix = logger.prefix;

      const logging: Logging = log;
      Logger.loggerCache.set(prefix, logging);

      return logging;
    }
  }

  /**
   * Turns on debug level logging. Off by default.
   * @param enabled {boolean}
   */
  public static setDebugEnabled(enabled = true): void {
    Logger.debugEnabled = enabled;
  }

  /**
   * Turns on inclusion of timestamps in log messages. On by default.
   * @param enabled {boolean}
   */
  public static setTimestampEnabled(enabled = true): void {
    Logger.timestampEnabled = enabled;
  }

  /** Forces color in logging output, even if it seems like color is unsupported. */
  public static forceColor(): void {
    chalk.level = 1;
  }

  public info(message: string, ...parameters: any[]): void {
    this.log(LogLevel.INFO, message, ...parameters);
  }

  public warn(message: string, ...parameters: any[]): void {
    this.log(LogLevel.WARN, message, ...parameters);
  }

  public error(message: string, ...parameters: any[]): void {
    this.log(LogLevel.ERROR, message, ...parameters);
  }

  public debug(message: string, ...parameters: any[]): void {
    this.log(LogLevel.DEBUG, message, ...parameters);
  }

  public log(level: LogLevel, message: string, ...parameters: any[]): void {
    if (level === LogLevel.DEBUG && !Logger.debugEnabled) return;

    message = util.format(message, ...parameters);

    let loggingFunction = console.log;
    switch (level) {
      case LogLevel.WARN:
        message = chalk.yellow(message);
        loggingFunction = console.error;
        break;
      case LogLevel.ERROR:
        message = chalk.red(message);
        loggingFunction = console.error;
        break;
      case LogLevel.DEBUG:
        message = chalk.gray(message);
        break;
    }

    if (this.prefix) message = `${getLogPrefix(this.prefix)} ${message}`;

    if (Logger.timestampEnabled) {
      const date = new Date();
      message = chalk.white(`[${date.toLocaleString()}] `) + message;
    }

    loggingFunction(message);
  }
}

/**
 * Gets the prefix for the logger.
 * @param prefix
 */
export function getLogPrefix(prefix: string): string {
  return chalk.cyan(`[${prefix}]`);
}
