/**
 * 环境相关的 IPC 处理器
 */

import { ipcMain } from 'electron'
import sshManager from '../ssh-manager.js'

/**
 * 注册环境相关的 IPC 处理器
 */
export function registerEnvironmentHandlers() {
  // 环境检查
  ipcMain.handle('ssh:checkEnvironment', async (event, serverId, envType, envName) => {
    try {
      const result = await sshManager.checkEnvironment(serverId, envType, envName)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取环境列表
  ipcMain.handle('ssh:getEnvironmentList', async (event, serverId, envType) => {
    try {
      const result = await sshManager.getEnvironmentList(serverId, envType)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 检测环境
  ipcMain.handle('ssh:detectEnvironments', async (event, serverId) => {
    try {
      const result = await sshManager.detectEnvironments(serverId)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取 Conda 环境
  ipcMain.handle('ssh:getCondaEnvironments', async (event, serverId, condaPath) => {
    try {
      const result = await sshManager.getCondaEnvironments(serverId, condaPath)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
