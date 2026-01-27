/**
 * 数据源相关的 IPC 处理器
 */

import { ipcMain } from 'electron'
import sshManager from '../ssh-manager.js'

/**
 * 注册数据源相关的 IPC 处理器
 */
export function registerDataSourceHandlers() {
  // 获取 Conda 数据源
  ipcMain.handle('datasource:getConda', async (event, serverId, envType, envName) => {
    try {
      const result = await sshManager.getCondaDataSource(serverId, envType, envName)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 设置 Conda 数据源
  ipcMain.handle('datasource:setConda', async (event, serverId, channels) => {
    try {
      const result = await sshManager.setCondaDataSource(serverId, channels)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取 Pip 数据源
  ipcMain.handle('datasource:getPip', async (event, serverId, envType, envName) => {
    try {
      const result = await sshManager.getPipDataSource(serverId, envType, envName)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 设置 Pip 数据源
  ipcMain.handle('datasource:setPip', async (event, serverId, indexUrl, extraIndexUrls) => {
    try {
      const result = await sshManager.setPipDataSource(serverId, indexUrl, extraIndexUrls)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 恢复默认数据源
  ipcMain.handle('datasource:restoreDefault', async (event, serverId, sourceType) => {
    try {
      const result = await sshManager.restoreDefaultDataSource(serverId, sourceType)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 测试数据源速度
  ipcMain.handle('datasource:testSpeed', async (event, serverId, url) => {
    try {
      const result = await sshManager.testDataSourceSpeed(serverId, url)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
