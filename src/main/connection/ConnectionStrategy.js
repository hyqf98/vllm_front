/**
 * 连接策略抽象类
 * 定义服务器连接的统一接口
 */

class ConnectionStrategy {
  constructor(serverConfig) {
    if (new.target === ConnectionStrategy) {
      throw new Error('ConnectionStrategy 是抽象类，不能直接实例化')
    }
    this.serverConfig = serverConfig
    this.isConnected = false
  }

  /**
   * 执行命令
   * @param {string} command - 要执行的命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execute(command, options = {}) {
    throw new Error('子类必须实现 execute 方法')
  }

  /**
   * 建立连接
   * @returns {Promise<Object>} 连接结果
   */
  async connect() {
    throw new Error('子类必须实现 connect 方法')
  }

  /**
   * 断开连接
   * @returns {Promise<Object>} 断开结果
   */
  async disconnect() {
    throw new Error('子类必须实现 disconnect 方法')
  }

  /**
   * 检查连接状态
   * @returns {boolean} 是否已连接
   */
  checkConnection() {
    return this.isConnected
  }
}

export default ConnectionStrategy
