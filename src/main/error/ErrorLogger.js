/**
 * 错误日志订阅者
 * 将错误记录到日志
 */

class ErrorLogger {
  /**
   * @param {Object} logger - 日志记录器
   */
  constructor(logger) {
    this.logger = logger
    this.errors = []
    this.maxErrors = 100
  }

  /**
   * 处理错误（观察者接口实现）
   * @param {Error|Object} error - 错误对象
   */
  onError(error) {
    const errorDetails = this.parseError(error)

    // 记录到日志
    this.logger.error('ErrorPublisher', `错误发生: ${errorDetails.type}`, {
      type: errorDetails.type,
      message: errorDetails.message,
      retryable: errorDetails.retryable,
      timestamp: errorDetails.timestamp
    })

    // 保存到内存
    this.errors.push(errorDetails)
    if (this.errors.length > this.maxErrors) {
      this.errors.shift()
    }
  }

  /**
   * 解析错误对象
   * @param {Error|Object} error - 错误对象
   * @returns {Object} 错误详情
   */
  parseError(error) {
    if (error instanceof Error) {
      return {
        type: 'unknown',
        message: error.message,
        stack: error.stack,
        retryable: false,
        timestamp: Date.now()
      }
    }

    if (typeof error === 'object') {
      return {
        type: error.type || 'unknown',
        message: error.message || error.stderr || error.error || '未知错误',
        retryable: error.retryable || false,
        timestamp: error.timestamp || Date.now()
      }
    }

    return {
      type: 'unknown',
      message: String(error),
      retryable: false,
      timestamp: Date.now()
    }
  }

  /**
   * 获取错误历史
   * @param {string} type - 错误类型过滤（可选）
   * @returns {Array} 错误列表
   */
  getErrors(type = null) {
    if (type) {
      return this.errors.filter(e => e.type === type)
    }
    return [...this.errors]
  }

  /**
   * 清空错误历史
   */
  clearErrors() {
    this.errors = []
  }

  /**
   * 获取错误统计
   * @returns {Object} 错误统计
   */
  getErrorStats() {
    const stats = {}
    const total = this.errors.length

    for (const error of this.errors) {
      stats[error.type] = (stats[error.type] || 0) + 1
    }

    return {
      total,
      byType: stats,
      retryable: this.errors.filter(e => e.retryable).length
    }
  }
}

export default ErrorLogger
