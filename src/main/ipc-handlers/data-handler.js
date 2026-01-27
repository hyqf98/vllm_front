/**
 * 数据相关的 IPC 处理器
 */

import { ipcMain } from 'electron'
import dataManager from '../data-manager.js'

/**
 * 注册数据相关的 IPC 处理器
 */
export function registerDataHandlers() {
  // 读取数据
  ipcMain.handle('data:read', async (event, moduleName, defaultValue = null) => {
    try {
      const data = await dataManager.readData(moduleName, defaultValue)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 写入数据
  ipcMain.handle('data:write', async (event, moduleName, data) => {
    try {
      const result = await dataManager.writeData(moduleName, data)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 删除数据
  ipcMain.handle('data:delete', async (event, moduleName) => {
    try {
      const result = await dataManager.deleteData(moduleName)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 检查数据是否存在
  ipcMain.handle('data:exists', async (event, moduleName) => {
    try {
      const exists = await dataManager.existsData(moduleName)
      return { success: true, data: exists }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 列出所有数据模块
  ipcMain.handle('data:list', async () => {
    try {
      const modules = await dataManager.listDataModules()
      return { success: true, data: modules }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 清空所有数据
  ipcMain.handle('data:clearAll', async () => {
    try {
      const result = await dataManager.clearAllData()
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取数据路径
  ipcMain.handle('data:getPath', async () => {
    try {
      const path = dataManager.dataDir
      return { success: true, data: path }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
