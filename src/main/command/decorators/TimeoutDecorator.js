/**
 * 超时装饰器
 * 为命令执行添加超时控制
 */

class TimeoutDecorator {
  /**
   * @param {Object} executor - 命令执行器
   * @param {number} timeout - 超时时间（毫秒）
   */
  constructor(executor, timeout = 30000) {
    this.executor = executor
    this.timeout = timeout
  }

  /**
   * 执行命令（带超时）
   * @param {string} command - 命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execute(command, options = {}) {
    const timeout = options.timeout || this.timeout

    // 创建超时 Promise
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`命令执行超时 (${timeout}ms)`))
      }, timeout)

      // 允许取消超时
      timeoutPromise._timer = timer
    })

    try {
      // 竞争执行：命令执行 vs 超时
      const result = await Promise.race([
        this.executor.execute(command, options),
        timeoutPromise
      ])

      // 取消超时定时器
      if (timeoutPromise._timer) {
        clearTimeout(timeoutPromise._timer)
      }

      return result
    } catch (error) {
      // 取消超时定时器
      if (timeoutPromise._timer) {
        clearTimeout(timeoutPromise._timer)
      }

      return {
        success: false,
        stdout: '',
        stderr: error.message,
        code: -1,
        timeout: true
      }
    }
  }

  /**
   * 设置超时时间
   * @param {number} timeout - 超时时间（毫秒）
   */
  setTimeout(timeout) {
    this.timeout = timeout
  }

  /**
   * 获取超时时间
   * @returns {number} 超时时间（毫秒）
   */
  getTimeout() {
    return this.timeout
  }
}

export default TimeoutDecorator
