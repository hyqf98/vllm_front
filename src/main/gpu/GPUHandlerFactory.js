/**
 * GPU 处理器工厂
 * 自动检测并创建相应的 GPU 处理器
 */

import NVIDIAGPUHandler from './NVIDIAGPUHandler.js'
import AMDGPUHandler from './AMDGPUHandler.js'
import IntelGPUHandler from './IntelGPUHandler.js'

class GPUHandlerFactory {
  static VENDORS = {
    NVIDIA: 'nvidia',
    AMD: 'amd',
    INTEL: 'intel',
    APPLE: 'apple'
  }

  /**
   * 创建 GPU 处理器（自动检测）
   * @param {string} serverId - 服务器ID
   * @param {Object} connection - 连接策略
   * @returns {Promise<BaseGPUHandler|null>} GPU 处理器实例
   */
  static async create(serverId, connection) {
    const handlers = [
      new NVIDIAGPUHandler(connection),
      new AMDGPUHandler(connection),
      new IntelGPUHandler(connection)
    ]

    // 按优先级检测
    for (const handler of handlers) {
      try {
        if (await handler.isAvailable(serverId)) {
          return handler
        }
      } catch (error) {
        // 继续尝试下一个
        console.warn(`检测 ${handler.getVendorName()} GPU 失败:`, error.message)
      }
    }

    return null
  }

  /**
   * 创建指定类型的 GPU 处理器
   * @param {string} vendor - GPU 厂商
   * @param {Object} connection - 连接策略
   * @returns {BaseGPUHandler} GPU 处理器实例
   */
  static createByVendor(vendor, connection) {
    switch (vendor) {
      case this.VENDORS.NVIDIA:
        return new NVIDIAGPUHandler(connection)

      case this.VENDORS.AMD:
        return new AMDGPUHandler(connection)

      case this.VENDORS.INTEL:
        return new IntelGPUHandler(connection)

      default:
        throw new Error(`不支持的 GPU 厂商: ${vendor}`)
    }
  }

  /**
   * 获取所有 GPU 处理器（多 GPU 环境）
   * @param {string} serverId - 服务器ID
   * @param {Object} connection - 连接策略
   * @returns {Promise<Array<BaseGPUHandler>>} GPU 处理器列表
   */
  static async createAll(serverId, connection) {
    const handlers = [
      new NVIDIAGPUHandler(connection),
      new AMDGPUHandler(connection),
      new IntelGPUHandler(connection)
    ]

    const availableHandlers = []

    for (const handler of handlers) {
      try {
        if (await handler.isAvailable(serverId)) {
          availableHandlers.push(handler)
        }
      } catch (error) {
        // 忽略错误
      }
    }

    return availableHandlers
  }

  /**
   * 获取支持的 GPU 厂商列表
   * @returns {Array<string>} 支持的厂商列表
   */
  static getSupportedVendors() {
    return [
      this.VENDORS.NVIDIA,
      this.VENDORS.AMD,
      this.VENDORS.INTEL
    ]
  }

  /**
   * 检查 GPU 厂商是否支持
   * @param {string} vendor - GPU 厂商
   * @returns {boolean} 是否支持
   */
  static isVendorSupported(vendor) {
    return this.getSupportedVendors().includes(vendor)
  }
}

export default GPUHandlerFactory
