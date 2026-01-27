/**
 * 服务器相关的 IPC 处理器
 */

import { ipcMain } from 'electron'
import sshManager from '../ssh-manager.js'

/**
 * 注册服务器相关的 IPC 处理器
 */
export function registerServerHandlers() {
  // SSH 连接管理
  ipcMain.handle('ssh:connect', async (event, config) => {
    try {
      const result = await sshManager.connect(config)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ssh:disconnect', async (event, serverId) => {
    try {
      await sshManager.disconnect(serverId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ssh:execCommand', async (event, serverId, command) => {
    try {
      const result = await sshManager.execCommand(serverId, command)
      return {
        success: result.success,
        code: result.code,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ssh:listDirectory', async (event, serverId, path) => {
    try {
      const result = await sshManager.listDirectory(serverId, path)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ssh:getServerInfo', async (event, serverId) => {
    try {
      const result = await sshManager.getServerInfo(serverId)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ssh:getServerGPUs', async (event, serverId) => {
    try {
      const result = await sshManager.getServerGPUs(serverId)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
