/**
 * 服务相关的 IPC 处理器
 */

import { ipcMain } from 'electron'
import sshManager from '../ssh-manager.js'

/**
 * 注册服务相关的 IPC 处理器
 */
export function registerServiceHandlers() {
  // 启动服务
  ipcMain.handle('service:start', async (event, serverId, serviceConfig) => {
    try {
      const result = await sshManager.startService(serverId, serviceConfig)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 停止服务
  ipcMain.handle('service:stop', async (event, serverId, pid, startCommand) => {
    try {
      const result = await sshManager.stopService(serverId, pid, startCommand)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 检查服务状态
  ipcMain.handle('service:checkStatus', async (event, serverId, pid) => {
    try {
      const result = await sshManager.checkServiceStatus(serverId, pid)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 检查所有服务状态
  ipcMain.handle('service:checkAllStatus', async (event, services) => {
    try {
      const results = await Promise.all(
        services.map(async (service) => {
          try {
            const status = await sshManager.checkServiceRealStatus(
              service.serverId,
              service.config
            )
            return {
              id: service.id,
              ...status
            }
          } catch (error) {
            return {
              id: service.id,
              status: 'unknown',
              error: error.message
            }
          }
        })
      )
      return { success: true, data: results }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
