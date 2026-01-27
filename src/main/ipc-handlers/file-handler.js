/**
 * 文件管理相关的 IPC 处理器
 */

import { ipcMain } from 'electron'
import sshManager from '../ssh-manager.js'

/**
 * 注册文件管理相关的 IPC 处理器
 */
export function registerFileHandlers() {
  // 列出目录
  ipcMain.handle('fileManager:listDirectory', async (event, serverId, path) => {
    try {
      const result = await sshManager.listDirectory(serverId, path)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 创建目录
  ipcMain.handle('fileManager:createDirectory', async (event, serverId, parentPath, name) => {
    try {
      const result = await sshManager.createDirectory(serverId, parentPath, name)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 创建文件
  ipcMain.handle('fileManager:createFile', async (event, serverId, parentPath, name) => {
    try {
      const result = await sshManager.createFile(serverId, parentPath, name)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 重命名
  ipcMain.handle('fileManager:rename', async (event, serverId, oldPath, newName) => {
    try {
      const result = await sshManager.rename(serverId, oldPath, newName)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 删除
  ipcMain.handle('fileManager:delete', async (event, serverId, paths) => {
    try {
      const result = await sshManager.delete(serverId, paths)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
