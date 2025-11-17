/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 日志配置
 */
interface LoggerConfig {
  level: LogLevel;
  enableTimestamp: boolean;
  enableColors: boolean;
}

/**
 * 颜色代码
 */
const colors = {
  reset: "\x1b[0m",
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  gray: "\x1b[90m", // gray
};

class Logger {
  private config: LoggerConfig = {
    level: LogLevel.INFO,
    enableTimestamp: true,
    enableColors: true,
  };

  /**
   * 配置 logger
   */
  configure(config: Partial<LoggerConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取时间戳
   */
  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString();
  }

  /**
   * 格式化日志消息
   */
  private format(level: string, message: string, color: string): string {
    const timestamp = this.config.enableTimestamp
      ? `${colors.gray}[${this.getTimestamp()}]${colors.reset} `
      : "";
    const levelStr = this.config.enableColors
      ? `${color}[${level}]${colors.reset}`
      : `[${level}]`;
    return `${timestamp}${levelStr} ${message}`;
  }

  /**
   * 输出日志
   */
  private log(level: LogLevel, levelName: string, color: string, message: string, ...args: any[]) {
    if (level < this.config.level) {
      return;
    }

    const formattedMessage = this.format(levelName, message, color);
    
    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedMessage, ...args);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage, ...args);
        break;
      default:
        console.log(formattedMessage, ...args);
    }
  }

  /**
   * Debug 级别日志
   */
  debug(message: string, ...args: any[]) {
    this.log(LogLevel.DEBUG, "DEBUG", colors.debug, message, ...args);
  }

  /**
   * Info 级别日志
   */
  info(message: string, ...args: any[]) {
    this.log(LogLevel.INFO, "INFO", colors.info, message, ...args);
  }

  /**
   * Warn 级别日志
   */
  warn(message: string, ...args: any[]) {
    this.log(LogLevel.WARN, "WARN", colors.warn, message, ...args);
  }

  /**
   * Error 级别日志
   */
  error(message: string, ...args: any[]) {
    this.log(LogLevel.ERROR, "ERROR", colors.error, message, ...args);
  }
}

// 导出单例
export const logger = new Logger();

// 可以通过环境变量配置日志级别
const logLevel = process.env.LOG_LEVEL?.toUpperCase();
if (logLevel && logLevel in LogLevel) {
  logger.configure({ level: LogLevel[logLevel as keyof typeof LogLevel] });
}
