/**
 * 日志工具
 */

import { LOG_LEVELS } from './constants.js'

class Logger {
  constructor() {
    this.level = LOG_LEVELS.INFO
    this.logs = []
    this.maxLogs = 1000
    this.enableConsole = true
  }

  /**
   * 设置日志级别
   * @param {string} level - 日志级别
   */
  setLevel(level) {
    if (Object.values(LOG_LEVELS).includes(level)) {
      this.level = level
    }
  }

  /**
   * 启用或禁用控制台输出
   * @param {boolean} enabled - 是否启用
   */
  setConsoleEnabled(enabled) {
    this.enableConsole = enabled
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} module - 模块名称
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  log(level, module, message, data = null) {
    const logEntry = {
      timestamp: Date.now(),
      level,
      module,
      message,
      data
    }

    // 添加到内存日志
    this.logs.push(logEntry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // 检查是否应该输出
    if (!this.shouldLog(level)) {
      return
    }

    // 输出到控制台
    if (this.enableConsole) {
      this.outputToConsole(level, module, message, data)
    }
  }

  /**
   * 判断是否应该记录该级别的日志
   * @param {string} level - 日志级别
   * @returns {boolean}
   */
  shouldLog(level) {
    const levels = [LOG_LEVELS.DEBUG, LOG_LEVELS.INFO, LOG_LEVELS.WARN, LOG_LEVELS.ERROR]
    const currentLevelIndex = levels.indexOf(this.level)
    const logLevelIndex = levels.indexOf(level)
    return logLevelIndex >= currentLevelIndex
  }

  /**
   * 输出到控制台
   * @param {string} level - 日志级别
   * @param {string} module - 模块名称
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  outputToConsole(level, module, message, data) {
    const timestamp = new Date().toISOString()
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`

    switch (level) {
      case LOG_LEVELS.ERROR:
        console.error(formattedMessage, data || '')
        break
      case LOG_LEVELS.WARN:
        console.warn(formattedMessage, data || '')
        break
      case LOG_LEVELS.DEBUG:
        console.debug(formattedMessage, data || '')
        break
      default:
        console.log(formattedMessage, data || '')
    }
  }

  /**
   * 记录 INFO 级别日志
   * @param {string} module - 模块名称
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  info(module, message, data) {
    this.log(LOG_LEVELS.INFO, module, message, data)
  }

  /**
   * 记录 WARN 级别日志
   * @param {string} module - 模块名称
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  warn(module, message, data) {
    this.log(LOG_LEVELS.WARN, module, message, data)
  }

  /**
   * 记录 ERROR 级别日志
   * @param {string} module - 模块名称
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  error(module, message, data) {
    this.log(LOG_LEVELS.ERROR, module, message, data)
  }

  /**
   * 记录 DEBUG 级别日志
   * @param {string} module - 模块名称
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  debug(module, message, data) {
    this.log(LOG_LEVELS.DEBUG, module, message, data)
  }

  /**
   * 获取所有日志
   * @returns {Array} 日志数组
   */
  getLogs() {
    return [...this.logs]
  }

  /**
   * 按级别获取日志
   * @param {string} level - 日志级别
   * @returns {Array} 过滤后的日志数组
   */
  getLogsByLevel(level) {
    return this.logs.filter(log => log.level === level)
  }

  /**
   * 按模块获取日志
   * @param {string} module - 模块名称
   * @returns {Array} 过滤后的日志数组
   */
  getLogsByModule(module) {
    return this.logs.filter(log => log.module === module)
  }

  /**
   * 清空日志
   */
  clearLogs() {
    this.logs = []
  }

  /**
   * 导出日志
   * @param {string} format - 导出格式 'json' | 'text'
   * @returns {string} 导出的日志字符串
   */
  exportLogs(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.logs, null, 2)
    } else {
      return this.logs.map(log => {
        const timestamp = new Date(log.timestamp).toISOString()
        return `[${timestamp}] [${log.level.toUpperCase()}] [${log.module}] ${log.message}`
      }).join('\n')
    }
  }
}

// 创建单例
const logger = new Logger()

export default logger
