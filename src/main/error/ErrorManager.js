/**
 * 错误管理器
 * 整合错误发布器、分类器和订阅者
 */

import ErrorPublisher from './ErrorPublisher.js'
import ErrorClassifier from './ErrorClassifier.js'
import ErrorLogger from './ErrorLogger.js'
import ErrorNotifier from './ErrorNotifier.js'

class ErrorManager {
  constructor() {
    this.publisher = new ErrorPublisher()
    this.classifier = new ErrorClassifier()
    this.logger = null
    this.notifier = null
  }

  /**
   * 初始化错误管理器
   * @param {Object} logger - 日志记录器
   * @param {BrowserWindow} mainWindow - 主窗口对象
   */
  initialize(logger, mainWindow = null) {
    // 创建错误日志订阅者
    this.logger = new ErrorLogger(logger)
    this.publisher.subscribe(this.logger)

    // 创建错误通知订阅者
    if (mainWindow) {
      this.notifier = new ErrorNotifier(mainWindow)
      this.publisher.subscribe(this.notifier)
    }
  }

  /**
   * 报告错误
   * @param {Error|Object} error - 错误对象
   */
  report(error) {
    // 先分类
    const errorDetails = this.classifier.getErrorDetails(error)

    // 发布给所有订阅者
    this.publisher.publish(errorDetails)
  }

  /**
   * 分类错误
   * @param {Error|Object} error - 错误对象
   * @returns {string} 错误类型
   */
  classify(error) {
    return this.classifier.classify(error)
  }

  /**
   * 判断错误是否可重试
   * @param {Error|Object} error - 错误对象
   * @returns {boolean} 是否可重试
   */
  isRetryable(error) {
    return this.classifier.isRetryable(error)
  }

  /**
   * 添加订阅者
   * @param {Object} subscriber - 订阅者对象
   * @returns {Function} 取消订阅函数
   */
  subscribe(subscriber) {
    return this.publisher.subscribe(subscriber)
  }

  /**
   * 取消订阅
   * @param {Object} subscriber - 订阅者对象
   */
  unsubscribe(subscriber) {
    this.publisher.unsubscribe(subscriber)
  }

  /**
   * 获取错误历史
   * @param {string} type - 错误类型过滤（可选）
   * @returns {Array} 错误列表
   */
  getErrors(type = null) {
    if (!this.logger) return []
    return this.logger.getErrors(type)
  }

  /**
   * 获取错误统计
   * @returns {Object} 错误统计
   */
  getErrorStats() {
    if (!this.logger) return { total: 0, byType: {}, retryable: 0 }
    return this.logger.getErrorStats()
  }

  /**
   * 清空错误历史
   */
  clearErrors() {
    if (this.logger) {
      this.logger.clearErrors()
    }
  }

  /**
   * 设置主窗口
   * @param {BrowserWindow} mainWindow - 主窗口对象
   */
  setMainWindow(mainWindow) {
    if (!this.notifier && mainWindow) {
      this.notifier = new ErrorNotifier(mainWindow)
      this.publisher.subscribe(this.notifier)
    } else if (this.notifier) {
      this.notifier.setMainWindow(mainWindow)
    }
  }

  /**
   * 添加自定义错误模式
   * @param {string} type - 错误类型
   * @param {Array<string>} patterns - 错误模式列表
   * @param {boolean} retryable - 是否可重试
   */
  addErrorPattern(type, patterns, retryable = false) {
    this.classifier.addErrorPattern(type, patterns, retryable)
  }
}

// 创建单例
const errorManager = new ErrorManager()

export default errorManager
export { ErrorPublisher, ErrorClassifier, ErrorLogger, ErrorNotifier }
