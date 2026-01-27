/**
 * 命令执行模块
 * 负责在本地或远程服务器上执行命令
 */

import { Client } from 'ssh2'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

class CommandExecutor {
  constructor(connectionManager) {
    this.connectionManager = connectionManager
  }

  /**
   * 执行本地命令
   * @param {string} command - 要执行的命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execLocalCommand(command, options = {}) {
    const {
      timeout = 30000,
      maxBuffer = 10 * 1024 * 1024
    } = options

    try {
      const { stdout, stderr } = await execAsync(command, {
        encoding: 'utf-8',
        maxBuffer,
        timeout,
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
   * 执行远程 SSH 命令
   * @param {Client} conn - SSH 连接对象
   * @param {string} command - 要执行的命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execSSHCommand(conn, command, options = {}) {
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

      conn.exec(command, (error, stream) => {
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
   * 在服务器上执行命令
   * @param {string} serverId - 服务器ID
   * @param {string} command - 要执行的命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execCommand(serverId, command, options = {}) {
    const server = this.connectionManager.getServerById(serverId)

    if (!server) {
      return {
        success: false,
        stderr: `服务器 ${serverId} 不存在`,
        code: -1
      }
    }

    // 本地宿主机
    if (server.type === 'localhost') {
      return this.execLocalCommand(command, options)
    }

    // SSH 服务器
    const conn = this.connectionManager.getConnection(serverId)
    if (!conn) {
      return {
        success: false,
        stderr: '未连接到服务器',
        code: -1
      }
    }

    return this.execSSHCommand(conn, command, options)
  }

  /**
   * 执行脚本
   * @param {string} serverId - 服务器ID
   * @param {string} scriptContent - 脚本内容
   * @param {string} interpreter - 解释器 (如 /bin/bash, /bin/python3)
   * @returns {Promise<Object>} 执行结果
   */
  async execScript(serverId, scriptContent, interpreter = '/bin/bash') {
    const command = `${interpreter} -c "${scriptContent.replace(/"/g, '\\"')}"`
    return this.execCommand(serverId, command)
  }
}

export default CommandExecutor
