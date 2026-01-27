/**
 * 连接管理模块
 * 负责管理 SSH 和本地连接
 */

import { Client } from 'ssh2'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

class ConnectionManager {
  constructor() {
    this.connections = new Map() // serverId -> connection
  }

  /**
   * 添加服务器配置
   * @param {Object} server - 服务器配置
   */
  addServer(server) {
    this.servers.set(server.id, server)
  }

  /**
   * 移除服务器配置
   * @param {string} serverId - 服务器ID
   */
  removeServer(serverId) {
    this.servers.delete(serverId)
  }

  /**
   * 获取服务器配置
   * @param {string} serverId - 服务器ID
   * @returns {Object|null} 服务器配置
   */
  getServerById(serverId) {
    return this.servers.get(serverId)
  }

  /**
   * 连接到服务器
   * @param {Object} config - 服务器配置
   * @returns {Promise<Object>} 连接结果
   */
  async connect(config) {
    const { type, id } = config

    // 本地宿主机不需要连接
    if (type === 'localhost') {
      return {
        success: true,
        message: '本地宿主机已就绪'
      }
    }

    // SSH 连接
    return new Promise((resolve) => {
      const conn = new Client()
      const { host, port, username, password, privateKey } = config

      const sshConfig = {
        host,
        port: port || 22,
        username,
        readyTimeout: 30000
      }

      if (password) {
        sshConfig.password = password
      } else if (privateKey) {
        sshConfig.privateKey = privateKey
      }

      conn.on('ready', () => {
        this.connections.set(id, conn)
        resolve({ success: true, message: 'SSH 连接成功' })
      })

      conn.on('error', (error) => {
        resolve({ success: false, error: error.message })
      })

      conn.connect(sshConfig)
    })
  }

  /**
   * 断开服务器连接
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Object>} 断开结果
   */
  async disconnect(serverId) {
    const server = this.getServerById(serverId)

    // 本地宿主机不需要断开
    if (!server || server.type === 'localhost') {
      return { success: true }
    }

    const conn = this.connections.get(serverId)
    if (conn) {
      return new Promise((resolve) => {
        conn.end()
        conn.on('close', () => {
          this.connections.delete(serverId)
          resolve({ success: true })
        })
      })
    }

    return { success: true }
  }

  /**
   * 获取连接对象
   * @param {string} serverId - 服务器ID
   * @returns {Client|null} SSH 连接对象
   */
  getConnection(serverId) {
    return this.connections.get(serverId)
  }

  /**
   * 检查连接状态
   * @param {string} serverId - 服务器ID
   * @returns {boolean} 是否已连接
   */
  isConnected(serverId) {
    if (serverId === 'localhost') return true
    return this.connections.has(serverId)
  }

  /**
   * 断开所有连接
   */
  disconnectAll() {
    for (const [serverId, conn] of this.connections.entries()) {
      try {
        conn.end()
      } catch (e) {
        console.error(`断开连接失败 [${serverId}]:`, e.message)
      }
    }
    this.connections.clear()
  }
}

export default ConnectionManager
