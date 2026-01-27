/**
 * 重试装饰器
 * 为命令执行添加自动重试功能
 */

class RetryDecorator {
  /**
   * @param {Object} executor - 命令执行器
   * @param {Object} options - 配置选项
   * @param {number} options.maxRetries - 最大重试次数
   * @param {number} options.initialDelay - 初始延迟（毫秒）
   * @param {number} options.backoffMultiplier - 退避乘数
   */
  constructor(executor, options = {}) {
    this.executor = executor
    this.maxRetries = options.maxRetries || 3
    this.initialDelay = options.initialDelay || 1000
    this.backoffMultiplier = options.backoffMultiplier || 2
  }

  /**
   * 判断错误是否可重试
   * @param {Object} result - 执行结果
   * @returns {boolean} 是否可重试
   */
  isRetryableError(result) {
    if (result.success) return false

    const retryableErrors = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'TIMEOUT',
      'network',
      'timeout',
      'connection',
      'temporary'
    ]

    const errorLower = (result.stderr || result.error || '').toLowerCase()
    return retryableErrors.some(keyword =>
      errorLower.includes(keyword.toLowerCase())
    )
  }

  /**
   * 执行命令（带重试）
   * @param {string} command - 命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execute(command, options = {}) {
    let lastError = null
    let delay = this.initialDelay

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const result = await this.executor.execute(command, options)

      if (result.success || !this.isRetryableError(result)) {
        if (attempt > 0) {
          result.attempts = attempt + 1
          result.retried = true
        }
        return result
      }

      lastError = result

      if (attempt < this.maxRetries) {
        console.log(`命令执行失败，${delay}ms 后进行第 ${attempt + 1}/${this.maxRetries} 次重试...`)
        await this.sleep(delay)
        delay *= this.backoffMultiplier
      }
    }

    return lastError
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export default RetryDecorator
