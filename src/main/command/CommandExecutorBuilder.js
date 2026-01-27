/**
 * 命令执行器构建器
 * 使用构建器模式组装命令执行器的装饰器
 */

import RetryDecorator from './decorators/RetryDecorator.js'
import TimeoutDecorator from './decorators/TimeoutDecorator.js'
import LoggingDecorator from './decorators/LoggingDecorator.js'

class CommandExecutorBuilder {
  /**
   * @param {Object} executor - 基础命令执行器
   */
  constructor(executor) {
    this.executor = executor
    this.decorators = []
  }

  /**
   * 添加重试装饰器
   * @param {Object} options - 重试选项
   * @returns {CommandExecutorBuilder} 构建器实例
   */
  withRetry(options = {}) {
    const defaultOptions = {
      maxRetries: 3,
      initialDelay: 1000,
      backoffMultiplier: 2
    }
    this.decorators.push(new RetryDecorator(this.executor, { ...defaultOptions, ...options }))
    return this
  }

  /**
   * 添加超时装饰器
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {CommandExecutorBuilder} 构建器实例
   */
  withTimeout(timeout = 30000) {
    this.decorators.push(new TimeoutDecorator(this.executor, timeout))
    return this
  }

  /**
   * 添加日志装饰器
   * @param {Object} logger - 日志记录器
   * @param {Object} options - 日志选项
   * @returns {CommandExecutorBuilder} 构建器实例
   */
  withLogging(logger, options = {}) {
    this.decorators.push(new LoggingDecorator(this.executor, logger, options))
    return this
  }

  /**
   * 添加自定义装饰器
   * @param {Object} decorator - 自定义装饰器
   * @returns {CommandExecutorBuilder} 构建器实例
   */
  withCustomDecorator(decorator) {
    this.decorators.push(decorator)
    return this
  }

  /**
   * 构建最终的命令执行器
   * @returns {Object} 装饰后的命令执行器
   */
  build() {
    if (this.decorators.length === 0) {
      return this.executor
    }

    // 按顺序应用装饰器
    // 注意：装饰器的应用顺序会影响执行顺序
    // 最后添加的装饰器最外层，最先执行
    let result = this.executor

    for (let i = this.decorators.length - 1; i >= 0; i--) {
      const decorator = this.decorators[i]
      // 更新装饰器的 executor 为当前 result
      decorator.executor = result
      result = decorator
    }

    return result
  }

  /**
   * 清空所有装饰器
   * @returns {CommandExecutorBuilder} 构建器实例
   */
  clear() {
    this.decorators = []
    return this
  }

  /**
   * 获取装饰器数量
   * @returns {number} 装饰器数量
   */
  getDecoratorCount() {
    return this.decorators.length
  }
}

export default CommandExecutorBuilder
