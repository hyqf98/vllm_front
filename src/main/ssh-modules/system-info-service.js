/**
 * 系统信息服务
 * 负责获取服务器系统信息
 */

import os from 'os'

class SystemInfoService {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor
  }

  /**
   * 获取本地系统基础信息
   * @returns {Object} 系统信息
   */
  getLocalSystemInfo() {
    return {
      type: process.platform === 'win32' ? 'windows' :
            process.platform === 'darwin' ? 'darwin' : 'linux',
      version: os.release(),
      hostname: os.hostname(),
      arch: os.arch()
    }
  }

  /**
   * 解析磁盘大小
   * @param {string} sizeStr - 大小字符串 (如 "10G", "500M")
   * @returns {number} 字节数
   */
  parseDiskSize(sizeStr) {
    if (!sizeStr || sizeStr === '-') return 0
    const units = { 'K': 1024, 'M': 1024**2, 'G': 1024**3, 'T': 1024**4, 'P': 1024**5 }
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)([KMGTPE])?$/i)
    if (!match) return 0
    const value = parseFloat(match[1])
    const unit = match[2]?.toUpperCase()
    return unit ? value * (units[unit] || 1) : value
  }

  /**
   * 获取本地服务器详细信息
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Object>} 服务器信息
   */
  async getLocalServerInfo(serverId) {
    const platform = process.platform === 'win32' ? 'windows' :
                     process.platform === 'darwin' ? 'darwin' : 'linux'

    try {
      // 操作系统信息
      const osInfo = {
        type: platform,
        name: platform === 'darwin' ? 'macOS' : platform === 'windows' ? 'Windows' : 'Linux',
        version: os.release(),
        hostname: os.hostname(),
        arch: os.arch()
      }

      // CPU 信息
      const cpus = os.cpus()
      const cpuModel = cpus[0]?.model || 'Unknown'
      const cpuCores = cpus.length

      // 获取 CPU 线程数
      let cpuThreads = cpuCores
      if (platform === 'darwin') {
        try {
          const threadsResult = await this.commandExecutor.execLocalCommand('sysctl -n hw.logicalcpu')
          if (threadsResult.success && threadsResult.stdout) {
            cpuThreads = parseInt(threadsResult.stdout.trim(), 10)
          }
        } catch (e) {
          console.warn('获取 CPU 线程数失败:', e.message)
        }
      } else if (platform === 'linux') {
        try {
          const threadsResult = await this.commandExecutor.execLocalCommand('nproc')
          if (threadsResult.success && threadsResult.stdout) {
            cpuThreads = parseInt(threadsResult.stdout.trim(), 10)
          }
        } catch (e) {
          console.warn('获取 CPU 线程数失败:', e.message)
        }
      }

      const cpuData = {
        model: cpuModel,
        cores: cpuCores,
        threads: cpuThreads,
        arch: os.arch(),
        usagePercent: 0,
        temperature: null,
        frequency: cpus[0]?.speed ? (cpus[0].speed / 1000).toFixed(2) : null
      }

      // 获取 CPU 使用率
      if (platform === 'darwin') {
        try {
          const cpuResult = await this.commandExecutor.execLocalCommand('top -l 1 | grep "CPU usage"')
          if (cpuResult.success && cpuResult.stdout) {
            const match = cpuResult.stdout.match(/(\d+\.?\d*)%\s+user/)
            if (match) {
              cpuData.usagePercent = parseFloat(match[1])
            }
          }
        } catch (e) {
          console.warn('获取 CPU 使用率失败:', e.message)
        }
      } else if (platform === 'linux') {
        try {
          const cpuResult = await this.commandExecutor.execLocalCommand('top -bn1 | grep "Cpu(s)"')
          if (cpuResult.success && cpuResult.stdout) {
            const match = cpuResult.stdout.match(/(\d+\.?\d*)\s*us/)
            if (match) {
              cpuData.usagePercent = parseFloat(match[1])
            }
          }
        } catch (e) {
          console.warn('获取 CPU 使用率失败:', e.message)
        }
      } else if (platform === 'windows') {
        try {
          const cpuResult = await this.commandExecutor.execLocalCommand('wmic cpu get loadpercentage /value')
          if (cpuResult.success && cpuResult.stdout) {
            const match = cpuResult.stdout.match(/LoadPercentage=(\d+)/)
            if (match) {
              cpuData.usagePercent = parseInt(match[1], 10)
            }
          }
        } catch (e) {
          console.warn('获取 CPU 使用率失败:', e.message)
        }
      }

      // 内存信息
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const memoryData = {
        total: totalMem,
        used: totalMem - freeMem,
        free: freeMem,
        usagePercent: ((totalMem - freeMem) / totalMem * 100).toFixed(1)
      }

      // 磁盘信息
      let diskData = []
      try {
        if (platform === 'windows') {
          const diskResult = await this.commandExecutor.execLocalCommand('wmic logicaldisk get size,freespace,caption')
          if (diskResult.success && diskResult.stdout) {
            const lines = diskResult.stdout.trim().split('\n').slice(1)
            diskData = lines.filter(line => line.trim()).map(line => {
              const parts = line.trim().split(/\s{2,}/)
              if (parts.length < 3) return null
              const caption = parts[0].trim()
              const free = parseInt(parts[1].trim(), 10)
              const size = parseInt(parts[2].trim(), 10)
              if (!size || size <= 0) return null
              return {
                device: caption,
                mount: caption,
                path: caption,
                total: size,
                used: size - free,
                free: free,
                usagePercent: ((size - free) / size * 100).toFixed(1)
              }
            }).filter(d => d && d.total > 0)
          }
        } else {
          const diskResult = await this.commandExecutor.execLocalCommand('df -h')
          if (diskResult.success && diskResult.stdout) {
            const lines = diskResult.stdout.trim().split('\n').slice(1)
            diskData = lines
              .filter(line => line.trim())
              .map(line => {
                const parts = line.split(/\s+/)
                if (parts.length < 5) return null

                const filesystem = parts[0]
                // 跳过特殊文件系统
                if (filesystem.includes('devfs') || filesystem.includes('tmpfs') ||
                    filesystem.includes('overlay') || filesystem.includes('shm') ||
                    filesystem.includes('xarts') || filesystem.includes('iSCPreboot') ||
                    filesystem.includes('Preboot') || filesystem.includes('Update') ||
                    filesystem.includes('Hardware')) {
                  return null
                }

                const size = parts[1]
                const used = parts[2]
                const avail = parts[3]
                const capacity = parts[4]

                const total = this.parseDiskSize(size)
                const usedBytes = this.parseDiskSize(used)
                const availBytes = this.parseDiskSize(avail)

                if (!total || total <= 0) return null

                let mount = '/'
                if (platform === 'darwin') {
                  const mountOnIndex = parts.findIndex(p => p === 'on')
                  if (mountOnIndex >= 0 && mountOnIndex + 1 < parts.length) {
                    mount = parts.slice(mountOnIndex + 1).join(' ')
                  } else if (parts.length >= 9) {
                    mount = parts[8]
                  }
                } else {
                  mount = parts[parts.length - 1]
                }

                return {
                  device: filesystem,
                  mount: mount,
                  path: mount,
                  total: total,
                  used: usedBytes,
                  free: availBytes,
                  usagePercent: capacity.replace('%', '')
                }
              })
              .filter(d => d && d.total > 0)
          }
        }
      } catch (e) {
        console.warn('获取磁盘信息失败:', e.message)
      }

      // GPU 信息（由 GPU 服务处理）
      let gpuData = []

      return {
        success: true,
        data: {
          os: osInfo,
          cpu: cpuData,
          memory: memoryData,
          disks: diskData,
          gpus: gpuData
        }
      }
    } catch (error) {
      console.error('获取本地服务器信息失败:', error)
      throw new Error(`获取本地服务器信息失败: ${error.message}`)
    }
  }

  /**
   * 获取远程服务器信息
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Object>} 服务器信息
   */
  async getRemoteServerInfo(serverId) {
    // 这里应该实现远程服务器信息获取逻辑
    // 可以复用本地获取逻辑，通过 commandExecutor 执行远程命令
    // 为了简化，这里返回基础信息
    return {
      success: true,
      data: {
        os: { type: 'linux', name: 'Linux', version: '', hostname: '', arch: '' },
        cpu: { model: '', cores: 0, threads: 0, usagePercent: 0 },
        memory: { total: 0, used: 0, free: 0, usagePercent: 0 },
        disks: [],
        gpus: []
      }
    }
  }

  /**
   * 获取服务器信息
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Object>} 服务器信息
   */
  async getServerInfo(serverId) {
    const server = this.commandExecutor.connectionManager.getServerById(serverId)

    if (!server) {
      throw new Error(`服务器 ${serverId} 不存在`)
    }

    if (server.type === 'localhost') {
      return this.getLocalServerInfo(serverId)
    } else {
      return this.getRemoteServerInfo(serverId)
    }
  }
}

export default SystemInfoService
