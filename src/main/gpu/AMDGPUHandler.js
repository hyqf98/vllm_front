/**
 * AMD GPU 处理器
 * 支持 AMD GPU 的信息查询和进程管理
 */

import BaseGPUHandler from './BaseGPUHandler.js'

class AMDGPUHandler extends BaseGPUHandler {
  constructor(connection) {
    super(connection)
    this.command = 'rocm-smi'
  }

  /**
   * 获取 GPU 厂商名称
   * @returns {string} 厂商名称
   */
  getVendorName() {
    return 'amd'
  }

  /**
   * 检查 AMD GPU 是否可用
   * @param {string} serverId - 服务器ID
   * @returns {Promise<boolean>} 是否可用
   */
  async isAvailable(serverId) {
    const result = await this.connection.execute(`${this.command} --showproductname`)
    return result.success && !result.stderr.includes('command not found')
  }

  /**
   * 获取所有 GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 进程列表
   */
  async getAllProcesses(serverId) {
    // ROCm 3.0+ 使用 rocm-smi 获取进程信息
    const command = `${this.command} --showpid --showmemuse --showuse --json`
    const result = await this.connection.execute(command)

    if (!result.success) {
      return []
    }

    try {
      const data = JSON.parse(result.stdout)
      const processes = []

      // 解析 ROCm 的 JSON 输出（根据实际格式调整）
      for (const [gpuId, gpuData] of Object.entries(data)) {
        if (gpuData.processes) {
          for (const proc of gpuData.processes) {
            processes.push({
              pid: proc.pid || 0,
              name: proc.name || 'unknown',
              memoryMB: proc.vram || 0,
              gpuId: parseInt(gpuId.replace(/\D/g, '')) || 0,
              gpuType: 'amd',
              serverId
            })
          }
        }
      }

      return processes
    } catch {
      // JSON 解析失败，可能是旧版本 ROCm
      return await this.getProcessesLegacy(serverId)
    }
  }

  /**
   * 获取 GPU 进程（旧版 ROCm 兼容）
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 进程列表
   */
  async getProcessesLegacy(serverId) {
    // 尝试使用其他方式获取进程信息
    return []
  }

  /**
   * 获取 GPU 信息
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 信息列表
   */
  async getGPUInfo(serverId) {
    const command = `${this.command} --showproductname --showmem --showuse --json`
    const result = await this.connection.execute(command)

    if (!result.success) {
      throw new Error(`获取 AMD GPU 信息失败: ${result.stderr}`)
    }

    try {
      const data = JSON.parse(result.stdout)
      const gpus = []

      for (const [gpuId, gpuData] of Object.entries(data)) {
        const id = parseInt(gpuId.replace(/\D/g, '')) || 0
        const memoryTotal = this.parseMemory(gpuData['VRAM Total'] || '0')
        const memoryUsed = this.parseMemory(gpuData['VRAM Used'] || '0')

        gpus.push({
          id,
          name: gpuData['Card series'] || gpuData['Card Model'] || 'AMD GPU',
          memoryTotal,
          memoryUsed,
          memoryFree: memoryTotal - memoryUsed,
          memoryUsagePercent: memoryTotal > 0 ? ((memoryUsed / memoryTotal) * 100).toFixed(1) : 0,
          gpuUtil: parseInt(gpuData['GPU use'] || '0', 10) || 0,
          temperature: parseInt(gpuData['Temperature (Sensor edge) (C)'] || gpuData['Temperature'] || '0', 10) || null,
          vendor: 'amd'
        })
      }

      return gpus
    } catch (error) {
      throw new Error(`解析 AMD GPU 信息失败: ${error.message}`)
    }
  }

  /**
   * 获取 GPU 的详细统计信息
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Object>} GPU 统计信息
   */
  async getGPUStats(serverId) {
    const gpus = await this.getGPUInfo(serverId)

    if (gpus.length === 0) {
      return {
        totalGPUs: 0,
        totalMemory: 0,
        usedMemory: 0,
        avgUtilization: 0,
        avgTemperature: 0
      }
    }

    const totalMemory = gpus.reduce((sum, gpu) => sum + gpu.memoryTotal, 0)
    const usedMemory = gpus.reduce((sum, gpu) => sum + gpu.memoryUsed, 0)
    const avgUtilization = gpus.reduce((sum, gpu) => sum + gpu.gpuUtil, 0) / gpus.length
    const avgTemperature = gpus
      .filter(gpu => gpu.temperature !== null)
      .reduce((sum, gpu) => sum + gpu.temperature, 0) / gpus.filter(gpu => gpu.temperature !== null).length

    return {
      totalGPUs: gpus.length,
      totalMemory,
      usedMemory,
      freeMemory: totalMemory - usedMemory,
      memoryUsagePercent: totalMemory > 0 ? ((usedMemory / totalMemory) * 100).toFixed(1) : 0,
      avgUtilization: avgUtilization.toFixed(1),
      avgTemperature: avgTemperature ? avgTemperature.toFixed(1) : null,
      gpus
    }
  }
}

export default AMDGPUHandler
