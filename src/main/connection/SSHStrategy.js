/**
 * SSH 连接策略
 * 用于远程服务器连接和命令执行
 */

import { Client } from 'ssh2'
import ConnectionStrategy from './ConnectionStrategy.js'

class SSHStrategy extends ConnectionStrategy {
  constructor(serverConfig) {
    super(serverConfig)
    this.client = null
  }

  /**
   * 建立 SSH 连接
   * @returns {Promise<Object>} 连接结果
   */
  async connect() {
    const { host, port, username, password, privateKey } = this.serverConfig

    return new Promise((resolve) => {
      this.client = new Client()

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

      this.client.on('ready', () => {
        this.isConnected = true
        resolve({ success: true, message: 'SSH 连接成功' })
      })

      this.client.on('error', (error) => {
        this.isConnected = false
        resolve({ success: false, error: error.message })
      })

      this.client.connect(sshConfig)
    })
  }

  /**
   * 执行远程命令
   * @param {string} command - 要执行的命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execute(command, options = {}) {
    if (!this.isConnected || !this.client) {
      return {
        success: false,
        stdout: '',
        stderr: '未连接到服务器',
        code: -1
      }
    }

    const { timeout = 30000 } = options

    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let timer = null

      if (timeout > 0) {
        timer = setTimeout(() => {
          resolve({
            success: false,
            stdout,
            stderr: stderr || '命令执行超时',
            code: -1
          })
        }, timeout)
      }

      this.client.exec(command, (error, stream) => {
        if (error) {
          if (timer) clearTimeout(timer)
          resolve({
            success: false,
            stderr: error.message,
            code: -1
          })
          return
        }

        stream.on('data', (data) => {
          stdout += data.toString()
        })

        stream.stderr.on('data', (data) => {
          stderr += data.toString()
        })

        stream.on('close', (code) => {
          if (timer) clearTimeout(timer)
          resolve({
            success: code === 0,
            stdout,
            stderr,
            code
          })
        })
      })
    })
  }

  /**
   * 断开 SSH 连接
   * @returns {Promise<Object>} 断开结果
   */
  async disconnect() {
    if (this.client) {
      return new Promise((resolve) => {
        this.client.end()
        this.client.on('close', () => {
          this.isConnected = false
          this.client = null
          resolve({ success: true })
        })
      })
    }
    return { success: true }
  }

  /**
   * 获取 SSH 客户端实例
   * @returns {Client|null} SSH 客户端
   */
  getClient() {
    return this.client
  }
}

export default SSHStrategy
