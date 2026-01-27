/**
 * 进程服务
 * 负责管理 GPU 进程和系统进程
 */

class ProcessService {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor
  }

  /**
   * 获取 NVIDIA GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 进程列表
   */
  async getNVIDIAProcesses(serverId) {
    const command = 'nvidia-smi --query-compute-apps=pid,process_name,used_memory,gpu_uuid --format=csv,noheader,nounits'
    const result = await this.commandExecutor.execCommand(serverId, command)

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
   * 获取 AMD GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 进程列表
   */
  async getAMDProcesses(serverId) {
    const command = 'rocm-smi --showpid --showmemuse --showuse --json'
    const result = await this.commandExecutor.execCommand(serverId, command)

    if (!result.success) {
      return []
    }

    // 解析 AMD GPU 进程信息（需要根据实际输出格式调整）
    const processes = []

    try {
      const data = JSON.parse(result.stdout)
      // 根据实际返回的数据结构解析
      // 这里需要根据 rocm-smi 的实际输出格式调整
    } catch (e) {
      console.warn('解析 AMD GPU 进程信息失败:', e.message)
    }

    return processes
  }

  /**
   * 获取 Intel GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 进程列表
   */
  async getIntelProcesses(serverId) {
    // Intel GPU 进程检测（需要根据实际工具调整）
    const processes = []

    // 这里可以使用 intel_gpu_top 或其他工具
    // 暂时返回空列表
    return processes
  }

  /**
   * 获取所有 GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 进程列表
   */
  async getGPUProcesses(serverId) {
    // 先尝试 NVIDIA
    try {
      const nvidiaProcesses = await this.getNVIDIAProcesses(serverId)
      if (nvidiaProcesses.length > 0) {
        return nvidiaProcesses
      }
    } catch (e) {
      console.warn('获取 NVIDIA GPU 进程失败:', e.message)
    }

    // 尝试 AMD
    try {
      const amdProcesses = await this.getAMDProcesses(serverId)
      if (amdProcesses.length > 0) {
        return amdProcesses
      }
    } catch (e) {
      console.warn('获取 AMD GPU 进程失败:', e.message)
    }

    // 尝试 Intel
    try {
      const intelProcesses = await this.getIntelProcesses(serverId)
      if (intelProcesses.length > 0) {
        return intelProcesses
      }
    } catch (e) {
      console.warn('获取 Intel GPU 进程失败:', e.message)
    }

    return []
  }

  /**
   * 终止 GPU 进程
   * @param {string} serverId - 服务器ID
   * @param {number} pid - 进程ID
   * @returns {Promise<Object>} 执行结果
   */
  async killGPUProcess(serverId, pid) {
    const command = `kill -9 ${pid}`
    return this.commandExecutor.execCommand(serverId, command)
  }

  /**
   * 批量终止 GPU 进程
   * @param {string} serverId - 服务器ID
   * @param {Array<number>} pids - 进程ID列表
   * @returns {Promise<Object>} 执行结果
   */
  async killGPUBatchProcesses(serverId, pids) {
    if (!pids || pids.length === 0) {
      return { success: true, message: '没有需要终止的进程' }
    }

    const pidsStr = pids.join(' ')
    const command = `kill -9 ${pidsStr}`
    return this.commandExecutor.execCommand(serverId, command)
  }
}

export default ProcessService
