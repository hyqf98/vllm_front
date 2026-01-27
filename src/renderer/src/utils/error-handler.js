/**
 * 错误处理工具
 */

import { ERROR_TYPES } from './constants.js'
import logger from './logger.js'

/**
 * 自定义错误类
 */
export class AppError extends Error {
  constructor(message, type = ERROR_TYPES.UNKNOWN, code = null, details = null) {
    super(message)
    this.name = 'AppError'
    this.type = type
    this.code = code
    this.details = details
    this.timestamp = Date.now()
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp
    }
  }
}

/**
 * 错误分类器
 */
class ErrorClassifier {
  /**
   * 分类错误
   * @param {Error|string} error - 错误对象或错误消息
   * @returns {string} 错误类型
   */
  classify(error) {
    if (!error) return ERROR_TYPES.UNKNOWN

    const message = (error.message || error.stderr || error.toString() || '').toLowerCase()

    if (message.includes('econnrefused') || message.includes('connection refused')) {
      return ERROR_TYPES.CONNECTION_REFUSED
    }
    if (message.includes('etimedout') || message.includes('timeout')) {
      return ERROR_TYPES.TIMEOUT
    }
    if (message.includes('permission denied') || message.includes('eacces')) {
      return ERROR_TYPES.PERMISSION_DENIED
    }
    if (message.includes('command not found') || message.includes('enoent')) {
      return ERROR_TYPES.COMMAND_NOT_FOUND
    }
    if (message.includes('network') || message.includes('econnreset') || message.includes('enotfound')) {
      return ERROR_TYPES.NETWORK
    }

    return ERROR_TYPES.UNKNOWN
  }

  /**
   * 判断错误是否可重试
   * @param {Error|string} error - 错误对象或错误消息
   * @returns {boolean} 是否可重试
   */
  isRetryable(error) {
    const type = this.classify(error)
    const retryableTypes = [
      ERROR_TYPES.TIMEOUT,
      ERROR_TYPES.NETWORK,
      ERROR_TYPES.CONNECTION_REFUSED
    ]
    return retryableTypes.includes(type)
  }
}

/**
 * 错误处理器
 */
class ErrorHandler {
  constructor() {
    this.classifier = new ErrorClassifier()
    this.errorHandlers = new Map()
    this.errorLog = []
    this.maxLogSize = 100
  }

  /**
   * 注册错误处理器
   * @param {string} errorType - 错误类型
   * @param {Function} handler - 处理函数
   */
  registerHandler(errorType, handler) {
    this.errorHandlers.set(errorType, handler)
  }

  /**
   * 处理错误
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   * @returns {AppError} 标准化的错误对象
   */
  handle(error, context = 'Unknown') {
    const errorType = this.classifier.classify(error)

    // 记录错误
    this.logError(error, context, errorType)

    // 创建标准化错误
    const appError = this.createAppError(error, errorType, context)

    // 调用注册的处理器
    const handler = this.errorHandlers.get(errorType)
    if (handler) {
      try {
        handler(appError)
      } catch (handlerError) {
        logger.error('ErrorHandler', '错误处理器执行失败', handlerError)
      }
    }

    return appError
  }

  /**
   * 创建应用错误对象
   * @param {Error} error - 原始错误
   * @param {string} errorType - 错误类型
   * @param {string} context - 上下文
   * @returns {AppError} 应用错误对象
   */
  createAppError(error, errorType, context) {
    const message = error.message || error.toString() || '未知错误'
    const code = error.code || null
    const details = {
      context,
      originalError: error.toString()
    }

    return new AppError(message, errorType, code, details)
  }

  /**
   * 记录错误
   * @param {Error} error - 错误对象
   * @param {string} context - 上下文
   * @param {string} errorType - 错误类型
   */
  logError(error, context, errorType) {
    const logEntry = {
      timestamp: Date.now(),
      type: errorType,
      context,
      message: error.message || error.toString(),
      stack: error.stack
    }

    this.errorLog.push(logEntry)
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift()
    }

    logger.error(context, `Error [${errorType}]: ${logEntry.message}`)
  }

  /**
   * 获取错误日志
   * @param {string} type - 错误类型过滤
   * @returns {Array} 错误日志
   */
  getErrorLog(type = null) {
    if (type) {
      return this.errorLog.filter(entry => entry.type === type)
    }
    return [...this.errorLog]
  }

  /**
   * 清空错误日志
   */
  clearErrorLog() {
    this.errorLog = []
  }

  /**
   * 判断错误是否可重试
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否可重试
   */
  isRetryable(error) {
    return this.classifier.isRetryable(error)
  }
}

// 创建单例
const errorHandler = new ErrorHandler()

export default errorHandler
export { ErrorClassifier, AppError }
