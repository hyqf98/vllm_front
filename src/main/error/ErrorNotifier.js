/**
 * 错误通知订阅者
 * 向渲染进程发送错误通知
 */

class ErrorNotifier {
  /**
   * @param {BrowserWindow} mainWindow - 主窗口对象
   */
  constructor(mainWindow) {
    this.mainWindow = mainWindow
    this.enabled = true
    this.notificationQueue = []
    this.maxQueueSize = 50
  }

  /**
   * 处理错误（观察者接口实现）
   * @param {Error|Object} error - 错误对象
   */
  onError(error) {
    if (!this.enabled || !this.mainWindow || !this.mainWindow.webContents) {
      // 如果窗口不可用，加入队列
      this.enqueue(error)
      return
    }

    const errorData = this.parseError(error)

    // 发送到渲染进程
    this.mainWindow.webContents.send('error:occurred', errorData)
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
        timestamp: Date.now()
      }
    }

    if (typeof error === 'object') {
      return {
        type: error.type || 'unknown',
        message: error.message || error.stderr || '未知错误',
        retryable: error.retryable || false,
        timestamp: error.timestamp || Date.now()
      }
    }

    return {
      type: 'unknown',
      message: String(error),
      timestamp: Date.now()
    }
  }

  /**
   * 加入队列
   * @param {Error|Object} error - 错误对象
   */
  enqueue(error) {
    this.notificationQueue.push(this.parseError(error))

    if (this.notificationQueue.length > this.maxQueueSize) {
      this.notificationQueue.shift()
    }
  }

  /**
   * 发送队列中的通知
   */
  flushQueue() {
    if (!this.mainWindow || !this.mainWindow.webContents) {
      return
    }

    for (const error of this.notificationQueue) {
      this.mainWindow.webContents.send('error:occurred', error)
    }

    this.notificationQueue = []
  }

  /**
   * 启用通知
   */
  enable() {
    this.enabled = true
  }

  /**
   * 禁用通知
   */
  disable() {
    this.enabled = false
  }

  /**
   * 设置主窗口
   * @param {BrowserWindow} mainWindow - 主窗口对象
   */
  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow
    // 窗口可用时，发送队列中的通知
    if (mainWindow) {
      this.flushQueue()
    }
  }
}

export default ErrorNotifier
