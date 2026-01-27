/**
 * NVIDIA GPU 处理器
 * 支持 NVIDIA GPU 的信息查询和进程管理
 */

import BaseGPUHandler from './BaseGPUHandler.js'

class NVIDIAGPUHandler extends BaseGPUHandler {
  constructor(connection) {
    super(connection)
    this.command = 'nvidia-smi'
  }

  /**
   * 获取 GPU 厂商名称
   * @returns {string} 厂商名称
   */
  getVendorName() {
    return 'nvidia'
  }

  /**
   * 检查 NVIDIA GPU 是否可用
   * @param {string} serverId - 服务器ID
   * @returns {Promise<boolean>} 是否可用
   */
  async isAvailable(serverId) {
    const result = await this.connection.execute(
      `${this.command} --query-gpu=name --format=csv,noheader`
    )
    return result.success && result.stdout.trim().length > 0
  }

  /**
   * 获取所有 GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 进程列表
   */
  async getAllProcesses(serverId) {
    const command = `${this.command} --query-compute-apps=pid,process_name,used_memory,gpu_uuid --format=csv,noheader,nounits`
    const result = await this.connection.execute(command)

    if (!result.success) {
      throw new Error(`获取 NVIDIA GPU 进程失败: ${result.stderr}`)
    }

    const processes = []
    const lines = result.stdout.trim().split('\n')

    for (const line of lines) {
      if (!line.trim()) continue

      const parts = line.split(',').map(p => p.trim())
      if (parts.length < 3) continue

      processes.push({
        pid: parseInt(parts[0]) || 0,
        name: parts[1] || 'unknown',
        memoryMB: parseInt(parts[2]) || 0,
        gpuUuid: parts[3] || '',
        gpuType: 'nvidia',
        serverId
      })
    }

    return processes
  }

  /**
   * 获取 GPU 信息
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 信息列表
   */
  async getGPUInfo(serverId) {
    const command = `${this.command} --query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits`
    const result = await this.connection.execute(command)

    if (!result.success) {
      throw new Error(`获取 NVIDIA GPU 信息失败: ${result.stderr}`)
    }

    const lines = result.stdout.trim().split('\n')
    return lines
      .filter(line => line.trim())
      .map((line, index) => {
        const parts = line.split(',').map(p => p.trim())
        if (parts.length < 3) return null

        const memoryTotal = parseInt(parts[2], 10) * 1024 * 1024 // MB to Bytes
        const memoryUsed = parseInt(parts[3], 10) * 1024 * 1024

        return {
          id: parseInt(parts[0], 10) || index,
          name: parts[1],
          memoryTotal,
          memoryUsed,
          memoryFree: memoryTotal - memoryUsed,
          memoryUsagePercent: memoryTotal > 0 ? ((memoryUsed / memoryTotal) * 100).toFixed(1) : 0,
          gpuUtil: parseInt(parts[4], 10) || 0,
          temperature: parseInt(parts[5], 10) || null,
          powerDraw: parts[6] && parts[6] !== '[N/A]' ? parseFloat(parts[6]) : null,
          powerLimit: parts[7] && parts[7] !== '[N/A]' ? parseFloat(parts[7]) : null,
          vendor: 'nvidia'
        }
      })
      .filter(g => g)
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

export default NVIDIAGPUHandler
