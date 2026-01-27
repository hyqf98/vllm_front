/**
 * 连接策略工厂
 * 根据服务器类型创建相应的连接策略
 */

import LocalhostStrategy from './LocalhostStrategy.js'
import SSHStrategy from './SSHStrategy.js'

class ConnectionStrategyFactory {
  static STRATEGIES = {
    LOCALHOST: 'localhost',
    SSH: 'ssh',
    DOCKER: 'docker'
  }

  /**
   * 创建连接策略
   * @param {Object} serverConfig - 服务器配置
   * @returns {ConnectionStrategy} 连接策略实例
   */
  static create(serverConfig) {
    const { type } = serverConfig

    switch (type) {
      case this.STRATEGIES.LOCALHOST:
        return new LocalhostStrategy(serverConfig)

      case this.STRATEGIES.SSH:
        return new SSHStrategy(serverConfig)

      case this.STRATEGIES.DOCKER:
        // Docker 连接暂未实现
        throw new Error(`Docker 连接类型暂未实现`)

      default:
        throw new Error(`未知的服务器类型: ${type}`)
    }
  }

  /**
   * 获取支持的服务器类型列表
   * @returns {Array<string>} 支持的类型列表
   */
  static getSupportedTypes() {
    return [
      this.STRATEGIES.LOCALHOST,
      this.STRATEGIES.SSH
    ]
  }

  /**
   * 检查服务器类型是否支持
   * @param {string} type - 服务器类型
   * @returns {boolean} 是否支持
   */
  static isTypeSupported(type) {
    return this.getSupportedTypes().includes(type)
  }
}

export default ConnectionStrategyFactory
