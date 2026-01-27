/**
 * 模型相关的 IPC 处理器
 */

import { ipcMain, BrowserWindow } from 'electron'
import sshManager from '../ssh-manager.js'
import api from '../api/modelHub.js'

/**
 * 注册模型相关的 IPC 处理器
 */
export function registerModelHandlers() {
  // 获取模型列表
  ipcMain.handle('modelHub:getModels', async (event, platform, params) => {
    try {
      const result = await api.getModels(platform, params)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 检查命令
  ipcMain.handle('modelHub:checkCommand', async (event, serverId, envType, envName, command) => {
    try {
      const result = await sshManager.checkDownloadCommand(serverId, envType, envName, command)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 开始下载
  ipcMain.handle('modelHub:startDownload', async (event, downloadConfig) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender)

      await sshManager.downloadModel({
        ...downloadConfig,
        onProgress: (progress) => {
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('modelHub:downloadProgress', {
              modelId: downloadConfig.modelId,
              ...progress
            })
          }
        },
        onComplete: (result) => {
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('modelHub:downloadComplete', {
              modelId: downloadConfig.modelId,
              ...result
            })
          }
        },
        onError: (error) => {
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('modelHub:downloadError', {
              modelId: downloadConfig.modelId,
              error: error.message
            })
          }
        }
      })

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 取消下载
  ipcMain.handle('modelHub:cancelDownload', async (event, serverId, modelId) => {
    try {
      await sshManager.cancelDownload(serverId, modelId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
