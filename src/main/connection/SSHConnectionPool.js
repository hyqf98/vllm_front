/**
 * SSH 连接池
 * 管理和复用 SSH 连接，提高性能
 */

import ConnectionStrategyFactory from './ConnectionStrategyFactory.js'

class SSHConnectionPool {
  /**
   * @param {Object} config - 配置选项
   * @param {number} config.maxSize - 最大连接数
   * @param {number} config.idleTimeout - 空闲超时（毫秒）
   * @param {number} config.maxAge - 连接最大存活时间（毫秒）
   */
  constructor(config = {}) {
    this.maxSize = config.maxSize || 10
    this.idleTimeout = config.idleTimeout || 300000 // 5分钟
    this.maxAge = config.maxAge || 3600000 // 1小时
    this.pool = new Map() // key -> { connection, lastUsed, createdAt, inUse }
    this.activeCount = 0
  }

  /**
   * 获取连接键
   * @param {Object} serverConfig - 服务器配置
   * @returns {string} 连接键
   */
  getConnectionKey(serverConfig) {
    return `${serverConfig.host}:${serverConfig.port}@${serverConfig.username}`
  }

  /**
   * 获取连接
   * @param {Object} serverConfig - 服务器配置
   * @returns {Promise<Object>} 连接策略
   */
  async acquire(serverConfig) {
    const key = this.getConnectionKey(serverConfig)

    // 检查是否有可用的空闲连接
    if (this.pool.has(key)) {
      const pooled = this.pool.get(key)

      // 检查连接是否可用
      if (!pooled.inUse && this.isConnectionValid(pooled)) {
        pooled.inUse = true
        pooled.lastUsed = Date.now()
        this.activeCount++
        return pooled.connection
      } else {
        // 连接无效，从池中移除
        this.removeConnection(key)
      }
    }

    // 创建新连接
    const connection = await this.createConnection(serverConfig)
    this.pool.set(key, {
      connection,
      lastUsed: Date.now(),
      createdAt: Date.now(),
      inUse: true
    })
    this.activeCount++

    return connection
  }

  /**
   * 释放连接
   * @param {Object} serverConfig - 服务器配置
   */
  release(serverConfig) {
    const key = this.getConnectionKey(serverConfig)

    if (this.pool.has(key)) {
      const pooled = this.pool.get(key)

      if (pooled.inUse) {
        pooled.inUse = false
        pooled.lastUsed = Date.now()
        this.activeCount--

        // 设置空闲超时
        this.scheduleIdleRemoval(key)
      }
    }
  }

  /**
   * 创建新连接
   * @param {Object} serverConfig - 服务器配置
   * @returns {Promise<Object>} 连接策略
   */
  async createConnection(serverConfig) {
    const strategy = ConnectionStrategyFactory.create(serverConfig)
    await strategy.connect()
    return strategy
  }

  /**
   * 检查连接是否有效
   * @param {Object} pooled - 池化的连接对象
   * @returns {boolean} 是否有效
   */
  isConnectionValid(pooled) {
    // 检查连接是否超时
    if (Date.now() - pooled.createdAt > this.maxAge) {
      return false
    }

    // 检查连接状态
    return pooled.connection.checkConnection()
  }

  /**
   * 安排空闲连接移除
   * @param {string} key - 连接键
   */
  scheduleIdleRemoval(key) {
    setTimeout(() => {
      if (this.pool.has(key)) {
        const pooled = this.pool.get(key)

        // 如果仍然空闲，移除连接
        if (!pooled.inUse) {
          this.removeConnection(key)
        }
      }
    }, this.idleTimeout)
  }

  /**
   * 移除连接
   * @param {string} key - 连接键
   */
  async removeConnection(key) {
    if (this.pool.has(key)) {
      const pooled = this.pool.get(key)

      try {
        await pooled.connection.disconnect()
      } catch (error) {
        console.error(`断开连接失败 [${key}]:`, error.message)
      }

      this.pool.delete(key)
    }
  }

  /**
   * 获取连接池统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const totalConnections = this.pool.size
    const activeConnections = this.activeCount
    const idleConnections = totalConnections - activeConnections

    return {
      totalConnections,
      activeConnections,
      idleConnections,
      maxSize: this.maxSize,
      utilization: totalConnections > 0 ? (activeConnections / totalConnections * 100).toFixed(1) + '%' : '0%'
    }
  }

  /**
   * 清空连接池
   */
  async clear() {
    for (const [key, pooled] of this.pool.entries()) {
      try {
        await pooled.connection.disconnect()
      } catch (error) {
        console.error(`断开连接失败 [${key}]:`, error.message)
      }
    }

    this.pool.clear()
    this.activeCount = 0
  }

  /**
   * 清理空闲连接
   */
  async cleanupIdleConnections() {
    const now = Date.now()
    const keysToRemove = []

    for (const [key, pooled] of this.pool.entries()) {
      if (!pooled.inUse && (now - pooled.lastUsed > this.idleTimeout)) {
        keysToRemove.push(key)
      }
    }

    for (const key of keysToRemove) {
      await this.removeConnection(key)
    }

    return keysToRemove.length
  }

  /**
   * 清理过期连接
   */
  async cleanupExpiredConnections() {
    const now = Date.now()
    const keysToRemove = []

    for (const [key, pooled] of this.pool.entries()) {
      if (now - pooled.createdAt > this.maxAge) {
        keysToRemove.push(key)
      }
    }

    for (const key of keysToRemove) {
      await this.removeConnection(key)
    }

    return keysToRemove.length
  }
}

// 创建单例
const sshConnectionPool = new SSHConnectionPool()

export default sshConnectionPool
export { SSHConnectionPool }
