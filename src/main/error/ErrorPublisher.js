/**
 * 错误发布器（观察者模式中的 Subject）
 * 管理错误订阅和通知
 */

class ErrorPublisher {
  constructor() {
    this.subscribers = new Set()
  }

  /**
   * 订阅错误事件
   * @param {Object} subscriber - 订阅者对象，必须实现 onError 方法
   * @returns {Function} 取消订阅函数
   */
  subscribe(subscriber) {
    if (!subscriber || typeof subscriber.onError !== 'function') {
      throw new Error('订阅者必须实现 onError 方法')
    }

    this.subscribers.add(subscriber)

    // 返回取消订阅函数
    return () => {
      this.unsubscribe(subscriber)
    }
  }

  /**
   * 取消订阅
   * @param {Object} subscriber - 订阅者对象
   */
  unsubscribe(subscriber) {
    this.subscribers.delete(subscriber)
  }

  /**
   * 发布错误
   * @param {Error|Object} error - 错误对象
   */
  publish(error) {
    for (const subscriber of this.subscribers) {
      try {
        subscriber.onError(error)
      } catch (e) {
        console.error('订阅者处理错误失败:', e)
      }
    }
  }

  /**
   * 获取订阅者数量
   * @returns {number} 订阅者数量
   */
  getSubscriberCount() {
    return this.subscribers.size
  }

  /**
   * 清空所有订阅者
   */
  clear() {
    this.subscribers.clear()
  }
}

export default ErrorPublisher
