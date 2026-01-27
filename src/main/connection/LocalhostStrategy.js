/**
 * 本地宿主机连接策略
 * 用于本地命令执行
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import ConnectionStrategy from './ConnectionStrategy.js'

const execAsync = promisify(exec)

class LocalhostStrategy extends ConnectionStrategy {
  constructor(serverConfig) {
    super(serverConfig)
    this.isConnected = true
  }

  /**
   * 执行本地命令
   * @param {string} command - 要执行的命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execute(command, options = {}) {
    const {
      timeout = 30000,
      maxBuffer = 10 * 1024 * 1024
    } = options

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer,
        shell: process.platform === 'win32' ? true : undefined,
        env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' }
      })

      return {
        success: true,
        stdout: stdout || '',
        stderr: stderr || '',
        code: 0
      }
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        code: error.code || 1,
        error: error.message
      }
    }
  }

  /**
   * 建立连接（本地无需连接）
   * @returns {Promise<Object>} 连接结果
   */
  async connect() {
    this.isConnected = true
    return { success: true, message: '本地宿主机已就绪' }
  }

  /**
   * 断开连接（本地无需断开）
   * @returns {Promise<Object>} 断开结果
   */
  async disconnect() {
    this.isConnected = true // 保持本地连接状态
    return { success: true }
  }
}

export default LocalhostStrategy
