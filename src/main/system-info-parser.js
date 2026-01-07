/**
 * 系统信息 JSON 解析器
 * 解析脚本返回的 JSON 格式系统信息
 */

class SystemInfoParser {
  /**
   * 解析完整的系统信息 JSON
   * @param {string} jsonStr - JSON 字符串
   * @returns {Object} 解析后的系统信息
   */
  parse(jsonStr) {
    try {
      const data = JSON.parse(jsonStr)

      return {
        timestamp: data.timestamp,
        os: this.parseSystemInfo(data.system),
        cpu: this.parseCPUInfo(data.cpu),
        memory: this.parseMemoryInfo(data.memory),
        disks: this.parseDiskInfo(data.disks),
        gpus: this.parseGPUInfo(data.gpus)
      }
    } catch (error) {
      console.error('解析系统信息 JSON 失败:', error.message)
      throw new Error(`解析系统信息失败: ${error.message}`)
    }
  }

  /**
   * 解析系统信息
   * @param {Object} system - 系统信息对象
   * @returns {Object} 标准化的系统信息
   */
  parseSystemInfo(system) {
    if (!system) {
      return {
        type: 'unknown',
        name: 'Unknown',
        version: 'Unknown',
        kernel: 'Unknown',
        architecture: 'unknown',
        hostname: 'localhost'
      }
    }

    return {
      type: system.id || 'linux',
      name: system.name || 'Unknown',
      version: system.version || 'Unknown',
      kernel: system.kernel || 'Unknown',
      architecture: system.architecture || 'unknown',
      hostname: system.hostname || 'localhost'
    }
  }

  /**
   * 解析 CPU 信息
   * @param {Object} cpu - CPU 信息对象
   * @returns {Object} 标准化的 CPU 信息
   */
  parseCPUInfo(cpu) {
    if (!cpu) {
      return {
        model: 'Unknown CPU',
        cores: 0,
        threads: 0,
        architecture: 'unknown',
        frequency: '-',
        usagePercent: 0,
        temperature: null
      }
    }

    return {
      model: cpu.model || 'Unknown CPU',
      cores: cpu.cores || 0,
      threadsPerCore: cpu.threadsPerCore || 1,
      coresPerSocket: cpu.coresPerSocket || cpu.cores || 1,
      sockets: cpu.sockets || 1,
      threads: cpu.threads || cpu.cores || 0,
      architecture: cpu.architecture || 'unknown',
      frequency: cpu.frequency || '-',
      maxFrequency: cpu.maxFrequency || null,
      minFrequency: cpu.minFrequency || null,
      usagePercent: cpu.usagePercent || 0,
      temperature: cpu.temperature || null
    }
  }

  /**
   * 解析内存信息
   * @param {Object} memory - 内存信息对象
   * @returns {Object} 标准化的内存信息
   */
  parseMemoryInfo(memory) {
    if (!memory) {
      return {
        total: 0,
        used: 0,
        free: 0,
        available: 0,
        usagePercent: 0
      }
    }

    return {
      total: memory.total || 0,
      used: memory.used || 0,
      free: memory.free || 0,
      available: memory.available || memory.free || 0,
      usagePercent: memory.usagePercent || 0
    }
  }

  /**
   * 解析磁盘信息
   * @param {Array} disks - 磁盘信息数组
   * @returns {Array} 标准化的磁盘信息
   */
  parseDiskInfo(disks) {
    if (!Array.isArray(disks)) {
      return []
    }

    return disks.map(disk => ({
      device: disk.device || 'unknown',
      mount: disk.mount || disk.path || '/',
      path: disk.path || disk.mount || '/',
      total: disk.total || 0,
      used: disk.used || 0,
      free: disk.free || disk.available || 0,
      available: disk.available || disk.free || 0,
      usagePercent: disk.usagePercent || 0
    }))
  }

  /**
   * 解析 GPU 信息
   * @param {Array} gpus - GPU 信息数组
   * @returns {Array} 标准化的 GPU 信息
   */
  parseGPUInfo(gpus) {
    if (!Array.isArray(gpus)) {
      return []
    }

    return gpus.map((gpu, index) => ({
      id: gpu.id || index,
      name: gpu.name || 'Unknown GPU',
      vendor: gpu.vendor || this.detectVendor(gpu.name),
      memoryTotal: gpu.memoryTotal || 0,
      memoryUsed: gpu.memoryUsed || 0,
      memoryUsagePercent: gpu.memoryUsagePercent || gpu.memoryUtil || 0,
      gpuUtil: gpu.gpuUtil || 0,
      temperature: gpu.temperature || 0,
      powerDraw: gpu.powerDraw || 0,
      powerLimit: gpu.powerLimit || 0,
      fanSpeed: gpu.fanSpeed || 0,
      unifiedMemory: gpu.unifiedMemory || false
    }))
  }

  /**
   * 检测 GPU 厂商
   * @param {string} name - GPU 名称
   * @returns {string} 厂商标识
   */
  detectVendor(name) {
    if (!name) return 'unknown'

    const lowerName = name.toLowerCase()

    if (lowerName.includes('nvidia') || lowerName.includes('geforce') || lowerName.includes('quadro') || lowerName.includes('tesla')) {
      return 'nvidia'
    }

    if (lowerName.includes('amd') || lowerName.includes('radeon') || lowerName.includes('firepro')) {
      return 'amd'
    }

    if (lowerName.includes('apple') || lowerName.includes('m1') || lowerName.includes('m2') || lowerName.includes('m3') || lowerName.includes('a1') || lowerName.includes('a2')) {
      return 'apple'
    }

    if (lowerName.includes('intel')) {
      return 'intel'
    }

    return 'unknown'
  }
}

// 导出单例
export default new SystemInfoParser()
