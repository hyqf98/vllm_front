/**
 * Intel GPU 处理器
 * 支持 Intel GPU 的信息查询和进程管理
 */

import BaseGPUHandler from './BaseGPUHandler.js'

class IntelGPUHandler extends BaseGPUHandler {
  constructor(connection) {
    super(connection)
    this.command = 'intel_gpu_top'
  }

  /**
   * 获取 GPU 厂商名称
   * @returns {string} 厂商名称
   */
  getVendorName() {
    return 'intel'
  }

  /**
   * 检查 Intel GPU 是否可用
   * @param {string} serverId - 服务器ID
   * @returns {Promise<boolean>} 是否可用
   */
  async isAvailable(serverId) {
    // 检查 intel_gpu_top 命令
    const result = await this.connection.execute('which intel_gpu_top')
    return result.success && result.stdout.trim().length > 0
  }

  /**
   * 获取所有 GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 进程列表
   */
  async getAllProcesses(serverId) {
    // Intel GPU 进程检测
    // 可以使用 intel_gpu_top 或其他工具
    return []
  }

  /**
   * 获取 GPU 信息
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 信息列表
   */
  async getGPUInfo(serverId) {
    // Intel GPU 信息获取
    // 可以从 /sys/class/drm 等位置获取
    const result = await this.connection.execute('ls /sys/class/drm | grep "^card"')

    if (!result.success) {
      return []
    }

    const cards = result.stdout.trim().split('\n').filter(c => c.trim())
    const gpus = []

    for (const card of cards) {
      // 获取 GPU 信息
      const devicePath = `/sys/class/drm/${card}/device`
      const nameResult = await this.connection.execute(`cat ${devicePath}/name 2>/dev/null || echo "Intel GPU"`)

      gpus.push({
        id: parseInt(card.replace(/\D/g, '')) || 0,
        name: nameResult.success ? nameResult.stdout.trim() : 'Intel GPU',
        memoryTotal: null, // Intel 集显使用系统内存
        memoryUsed: null,
        memoryFree: null,
        memoryUsagePercent: null,
        gpuUtil: null,
        temperature: null,
        vendor: 'intel',
        integrated: true
      })
    }

    return gpus
  }

  /**
   * 获取 GPU 的详细统计信息
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Object>} GPU 统计信息
   */
  async getGPUStats(serverId) {
    const gpus = await this.getGPUInfo(serverId)

    return {
      totalGPUs: gpus.length,
      totalMemory: 0, // 集显使用系统内存
      usedMemory: 0,
      freeMemory: 0,
      memoryUsagePercent: 0,
      avgUtilization: 0,
      avgTemperature: null,
      gpus
    }
  }
}

export default IntelGPUHandler
