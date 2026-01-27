/**
 * 错误分类器
 * 对错误进行分类和判断是否可重试
 */

class ErrorClassifier {
  constructor() {
    this.errorPatterns = {
      // 连接拒绝
      connectionRefused: [
        'econnrefused',
        'connection refused',
        'connection reset'
      ],

      // 超时
      timeout: [
        'etimedout',
        'timeout',
        'timed out'
      ],

      // 权限拒绝
      permissionDenied: [
        'permission denied',
        'eacces',
        'access denied'
      ],

      // 命令未找到
      commandNotFound: [
        'command not found',
        'enoent',
        'no such file or directory'
      ],

      // 网络错误
      networkError: [
        'network',
        'econnreset',
        'enotfound',
        'econnaborted',
        'host unreachable'
      ],

      // 认证失败
      authenticationFailed: [
        'authentication failed',
        'auth failed',
        'login failed',
        'invalid credentials'
      ],

      // 临时错误
      temporary: [
        'temporary',
        'temporarily',
        'try again later'
      ]
    }

    this.retryableTypes = ['timeout', 'networkError', 'connectionRefused', 'temporary']
  }

  /**
   * 分类错误
   * @param {Error|Object|string} error - 错误对象或错误消息
   * @returns {string} 错误类型
   */
  classify(error) {
    if (!error) return 'unknown'

    const message = this.extractErrorMessage(error)
    const messageLower = message.toLowerCase()

    // 检查各种错误模式
    for (const [type, patterns] of Object.entries(this.errorPatterns)) {
      for (const pattern of patterns) {
        if (messageLower.includes(pattern)) {
          return type
        }
      }
    }

    return 'unknown'
  }

  /**
   * 提取错误消息
   * @param {Error|Object|string} error - 错误对象或错误消息
   * @returns {string} 错误消息
   */
  extractErrorMessage(error) {
    if (typeof error === 'string') {
      return error
    }

    if (error instanceof Error) {
      return error.message
    }

    if (typeof error === 'object') {
      return error.message || error.stderr || error.error || error.toString()
    }

    return String(error)
  }

  /**
   * 判断错误是否可重试
   * @param {Error|Object|string} error - 错误对象或错误消息
   * @returns {boolean} 是否可重试
   */
  isRetryable(error) {
    const type = this.classify(error)
    return this.retryableTypes.includes(type)
  }

  /**
   * 获取错误详情
   * @param {Error|Object|string} error - 错误对象或错误消息
   * @returns {Object} 错误详情
   */
  getErrorDetails(error) {
    const type = this.classify(error)
    const message = this.extractErrorMessage(error)

    return {
      type,
      message,
      retryable: this.isRetryable(error),
      timestamp: Date.now()
    }
  }

  /**
   * 添加自定义错误模式
   * @param {string} type - 错误类型
   * @param {Array<string>} patterns - 错误模式列表
   * @param {boolean} retryable - 是否可重试
   */
  addErrorPattern(type, patterns, retryable = false) {
    this.errorPatterns[type] = patterns

    if (retryable && !this.retryableTypes.includes(type)) {
      this.retryableTypes.push(type)
    }
  }

  /**
   * 移除错误模式
   * @param {string} type - 错误类型
   */
  removeErrorPattern(type) {
    delete this.errorPatterns[type]

    const index = this.retryableTypes.indexOf(type)
    if (index > -1) {
      this.retryableTypes.splice(index, 1)
    }
  }
}

export default ErrorClassifier
