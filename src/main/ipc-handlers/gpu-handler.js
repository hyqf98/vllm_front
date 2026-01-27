/**
 * GPU 相关的 IPC 处理器
 */

import { ipcMain } from 'electron'
import sshManager from '../ssh-manager.js'

/**
 * 注册 GPU 相关的 IPC 处理器
 */
export function registerGPUHandlers() {
  // 获取 GPU 进程
  ipcMain.handle('gpu:getProcesses', async (event, serverId) => {
    try {
      const result = await sshManager.getGPUProcesses(serverId)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 终止 GPU 进程
  ipcMain.handle('gpu:killProcess', async (event, serverId, pid) => {
    try {
      const result = await sshManager.killGPUProcess(serverId, pid)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 批量终止 GPU 进程
  ipcMain.handle('gpu:killBatchProcesses', async (event, serverId, pids) => {
    try {
      const result = await sshManager.killGPUBatchProcesses(serverId, pids)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
