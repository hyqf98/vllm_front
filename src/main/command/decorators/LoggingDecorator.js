/**
 * 日志装饰器
 * 为命令执行添加日志记录功能
 */

class LoggingDecorator {
  /**
   * @param {Object} executor - 命令执行器
   * @param {Object} logger - 日志记录器
   * @param {Object} options - 配置选项
   * @param {boolean} options.logCommand - 是否记录命令
   * @param {boolean} options.logResult - 是否记录结果
   * @param {boolean} options.logError - 是否记录错误
   */
  constructor(executor, logger, options = {}) {
    this.executor = executor
    this.logger = logger
    this.logCommand = options.logCommand !== false
    this.logResult = options.logResult !== false
    this.logError = options.logError !== false
  }

  /**
   * 执行命令（带日志）
   * @param {string} command - 命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execute(command, options = {}) {
    const startTime = Date.now()

    if (this.logCommand) {
      this.logger.info('CommandExecutor', `执行命令: ${command}`)
    }

    try {
      const result = await this.executor.execute(command, options)
      const duration = Date.now() - startTime

      if (this.logResult && result.success) {
        this.logger.info('CommandExecutor', `命令执行成功 (${duration}ms)`, {
          command,
          duration,
          outputLength: result.stdout?.length || 0
        })
      }

      if (this.logError && !result.success) {
        this.logger.error('CommandExecutor', `命令执行失败 (${duration}ms)`, {
          command,
          duration,
          error: result.stderr || result.error
        })
      }

      // 添加执行时间到结果
      result.duration = duration

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      if (this.logError) {
        this.logger.error('CommandExecutor', `命令执行异常 (${duration}ms)`, {
          command,
          duration,
          error: error.message
        })
      }

      return {
        success: false,
        stdout: '',
        stderr: error.message,
        code: -1,
        duration
      }
    }
  }

  /**
   * 设置日志选项
   * @param {Object} options - 日志选项
   */
  setLogOptions(options) {
    if (options.logCommand !== undefined) this.logCommand = options.logCommand
    if (options.logResult !== undefined) this.logResult = options.logResult
    if (options.logError !== undefined) this.logError = options.logError
  }
}

export default LoggingDecorator
