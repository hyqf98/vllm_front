/**
 * GPU 管理器
 * 负责检测和管理不同厂商的显卡
 */
import NvidiaGPUHandler from './nvidia-gpu-handler.js'

class GPUManager {
  constructor(sshManager) {
    this.sshManager = sshManager
    this.handlers = {
      nvidia: new NvidiaGPUHandler(sshManager)
    }
    // 缓存服务器的 GPU 厂商
    this.serverGPUVendorCache = new Map()
  }

  /**
   * 自动检测服务器的 GPU 厂商
   * @param {string} serverId - 服务器ID
   * @returns {Promise<string>} GPU 厂商名称
   */
  async detectGPUVendor(serverId) {
    // 检查缓存
    if (this.serverGPUVendorCache.has(serverId)) {
      return this.serverGPUVendorCache.get(serverId)
    }

    // 按优先级检测各个厂商
    const vendorPriority = ['nvidia'] // 可扩展: ['nvidia', 'amd', 'intel']

    for (const vendor of vendorPriority) {
      const handler = this.handlers[vendor]
      if (handler && await handler.isAvailable(serverId)) {
        this.serverGPUVendorCache.set(serverId, vendor)
        return vendor
      }
    }

    // 未检测到支持的 GPU
    this.serverGPUVendorCache.set(serverId, null)
    return null
  }

  /**
   * 获取服务器的 GPU 处理器
   * @param {string} serverId - 服务器ID
   * @returns {Promise<BaseGPUHandler>} GPU 处理器
   */
  async getGPUHandler(serverId) {
    const vendor = await this.detectGPUVendor(serverId)

    if (!vendor || !this.handlers[vendor]) {
      return null
    }

    return this.handlers[vendor]
  }

  /**
   * 获取所有 GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array<Object>>} 进程列表
   */
  async getAllGPUProcesses(serverId) {
    const handler = await this.getGPUHandler(serverId)

    if (!handler) {
      return []
    }

    return await handler.getAllGPUProcesses(serverId)
  }

  /**
   * 获取 GPU 进程 PID 列表
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array<number>>} PID 列表
   */
  async getGPUProcessPIDs(serverId) {
    const handler = await this.getGPUHandler(serverId)

    if (!handler) {
      return []
    }

    return await handler.getGPUProcessPIDs(serverId)
  }

  /**
   * 检查进程是否占用 GPU
   * @param {string} serverId - 服务器ID
   * @param {number} pid - 进程PID
   * @returns {Promise<boolean>} 是否占用 GPU
   */
  async isProcessOnGPU(serverId, pid) {
    const handler = await this.getGPUHandler(serverId)

    if (!handler) {
      return false
    }

    return await handler.isProcessOnGPU(serverId, pid)
  }

  /**
   * 检查 GPU 进程是否匹配指定服务
   * @param {string} serverId - 服务器ID
   * @param {Object} process - GPU 进程信息
   * @param {Object} serviceConfig - 服务配置
   * @returns {Promise<boolean>} 是否匹配
   */
  async isProcessMatchService(serverId, process, serviceConfig) {
    const handler = await this.getGPUHandler(serverId)

    if (!handler || !handler.isProcessMatchService) {
      return false
    }

    return await handler.isProcessMatchService(serverId, process, serviceConfig)
  }

  /**
   * 获取服务器的 GPU 厂商
   * @param {string} serverId - 服务器ID
   * @returns {Promise<string>} GPU 厂商名称
   */
  async getGPUVendor(serverId) {
    return await this.detectGPUVendor(serverId)
  }

  /**
   * 清除服务器 GPU 厂商缓存
   * @param {string} serverId - 服务器ID
   */
  clearCache(serverId) {
    this.serverGPUVendorCache.delete(serverId)
  }

  /**
   * 清除所有缓存
   */
  clearAllCache() {
    this.serverGPUVendorCache.clear()
  }
}

export default GPUManager
