/**
 * SSH连接管理模块
 * 处理与远程服务器的SSH连接和命令执行
 * 支持本地宿主机（localhost）和远程SSH服务器
 */

import { Client } from 'ssh2'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// 导入脚本管理器和解析器
import scriptManager from './script-manager.js';
import systemInfoParser from './system-info-parser.js';

// 导入解析器模块（保留用于其他功能）
import UbuntuParser from './ssh-modules/ubuntu-parser.js';
import CentosParser from './ssh-modules/centos-parser.js';
import LinuxParser from './ssh-modules/linux-parser.js';
import SystemDetector from './ssh-modules/system-detector.js';

// 导入 GPU 管理器
import GPUManager from './gpu-modules/gpu-manager.js';

class SSHManager {
  constructor() {
    this.connections = new Map() // serverId -> connection
    this.servers = new Map() // serverId -> server config (包含 type 和 osType)
    this.systemDetector = new SystemDetector(this);
    this.parsers = {
      ubuntu: new UbuntuParser(this),
      centos: new CentosParser(this),
      linux: new LinuxParser(this)
    };
    // GPU 管理器
    this.gpuManager = new GPUManager(this);
    // 缓存服务器系统类型，避免重复检测
    this.serverSystemCache = new Map();
  }

  /**
   * 添加或更新服务器配置
   * @param {Object} server - 服务器配置
   */
  addServer(server) {
    this.servers.set(server.id, server)
  }

  /**
   * 移除服务器配置
   * @param {string} serverId - 服务器ID
   */
  removeServer(serverId) {
    this.servers.delete(serverId)
  }

  /**
   * 根据ID获取服务器配置
   * @param {string} serverId - 服务器ID
   * @returns {Object|null} 服务器配置
   */
  getServerById(serverId) {
    return this.servers.get(serverId)
  }

  /**
   * 执行本地命令（用于 localhost 类型服务器）
   * @param {string} command - 要执行的命令
   * @returns {Promise<Object>} 执行结果
   */
  async execLocalCommand(command) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
        shell: process.platform === 'win32' ? true : undefined,
        env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' }
      })
      return {
        success: true,
        stdout: stdout || '',
        stderr: stderr || '',
        code: 0
      }
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        code: error.code || 1,
        error: error.message
      }
    }
  }

  /**
   * 获取本地系统信息
   * @returns {Object} 系统信息
   */
  getLocalSystemInfo() {
    const os = require('os')
    return {
      type: process.platform === 'win32' ? 'windows' :
            process.platform === 'darwin' ? 'darwin' : 'linux',
      version: os.release(),
      hostname: os.hostname(),
      arch: os.arch()
    }
  }

  /**
   * 获取本地服务器详细信息（CPU、内存、磁盘、GPU）
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Object>} 服务器信息
   */
  async getLocalServerInfo(serverId) {
    const os = require('os')
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
          const threadsResult = await this.execLocalCommand('sysctl -n hw.logicalcpu')
          if (threadsResult.success && threadsResult.stdout) {
            cpuThreads = parseInt(threadsResult.stdout.trim(), 10)
          }
        } catch (e) {
          console.warn('获取 CPU 线程数失败:', e.message)
        }
      } else if (platform === 'linux') {
        try {
          const threadsResult = await this.execLocalCommand('nproc')
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
          const cpuResult = await this.execLocalCommand('top -l 1 | grep "CPU usage"')
          if (cpuResult.success && cpuResult.stdout) {
            // macOS top 输出: "CPU usage: 10.5% user, 5.2% sys, 84.3% idle"
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
          const cpuResult = await this.execLocalCommand('top -bn1 | grep "Cpu(s)"')
          if (cpuResult.success && cpuResult.stdout) {
            // Linux top 输出: "%Cpu(s): 10.5 us, 5.2 sy, 84.3 id"
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
          const cpuResult = await this.execLocalCommand('wmic cpu get loadpercentage /value')
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
          const diskResult = await this.execLocalCommand('wmic logicaldisk get size,freespace,caption')
          if (diskResult.success && diskResult.stdout) {
            const lines = diskResult.stdout.trim().split('\n').slice(1)
            diskData = lines.filter(line => line.trim()).map(line => {
              const parts = line.trim().split(/\s{2,}/)  // 使用2个或更多空格分割
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
          // macOS/Linux 使用 df -h
          const diskResult = await this.execLocalCommand('df -h')
          if (diskResult.success && diskResult.stdout) {
            const lines = diskResult.stdout.trim().split('\n').slice(1)
            diskData = lines
              .filter(line => line.trim())
              .map(line => {
                const parts = line.split(/\s+/)
                if (parts.length < 5) return null

                const filesystem = parts[0]
                // 跳过一些特殊的文件系统
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

                // 解析大小（支持 K, M, G, T 等单位）
                const total = this.parseDiskSize(size)
                const usedBytes = this.parseDiskSize(used)
                const availBytes = this.parseDiskSize(avail)

                if (!total || total <= 0) return null

                // 获取挂载点（最后一列，格式可能是 "Mounted on" 或直接是路径）
                let mount = '/'
                if (platform === 'darwin') {
                  // macOS df 输出最后一列是挂载点
                  // 找到最后一个不是路径的列索引（Mounted on）
                  const mountOnIndex = parts.findIndex(p => p === 'on')
                  if (mountOnIndex >= 0 && mountOnIndex + 1 < parts.length) {
                    mount = parts.slice(mountOnIndex + 1).join(' ')
                  } else if (parts.length >= 9) {
                    // macOS 通常有 9 列，挂载点在第 9 列（索引 8）
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

      // GPU 信息
      let gpuData = []
      try {
        if (platform === 'darwin') {
          // macOS GPU 检测
          // 获取完整的 GPU 信息
          const gpuResult = await this.execLocalCommand('system_profiler SPDisplaysDataType 2>/dev/null')
          if (gpuResult.success && gpuResult.stdout) {
            const lines = gpuResult.stdout.trim().split('\n')
            let currentGpu = null

            for (const line of lines) {
              const trimmed = line.trim()

              // 检测新的 GPU 块（以 Graphics/Displays 或 GPU 名称开头）
              if (trimmed.includes(':') && !trimmed.startsWith(' ') && currentGpu) {
                gpuData.push(currentGpu)
                currentGpu = null
              }

              if (trimmed.includes('Chipset Model:')) {
                const name = trimmed.replace('Chipset Model:', '').trim()
                currentGpu = {
                  id: gpuData.length,
                  name: name,
                  vendor: name.toLowerCase().includes('nvidia') ? 'nvidia' :
                         name.toLowerCase().includes('amd') || name.toLowerCase().includes('radeon') ? 'amd' :
                         name.toLowerCase().includes('apple') || name.toLowerCase().includes('m1') ||
                         name.toLowerCase().includes('m2') || name.toLowerCase().includes('m3') ||
                         name.toLowerCase().includes('a1') || name.toLowerCase().includes('a2') ? 'apple' : 'unknown'
                }
              } else if (trimmed.includes('VRAM:') || trimmed.includes('VRAM ')) {
                if (currentGpu) {
                  // 提取显存大小，如 "8 GB" 或 "8192 MB"
                  const memMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i)
                  if (memMatch) {
                    let vram = parseFloat(memMatch[1])
                    if (memMatch[2].toUpperCase() === 'GB') {
                      vram = vram * 1024 * 1024 * 1024
                    } else {
                      vram = vram * 1024 * 1024
                    }
                    currentGpu.memoryTotal = vram
                    currentGpu.memoryUsed = 0
                  }
                }
              } else if (trimmed.includes('Total Number of Cores:') && currentGpu) {
                // Apple GPU 核心数
                const cores = trimmed.replace('Total Number of Cores:', '').trim()
                currentGpu.cores = parseInt(cores, 10)
              }
            }
            if (currentGpu) {
              gpuData.push(currentGpu)
            }

            // 对于 Apple Silicon，添加统一内存信息
            if (gpuData.length > 0 && gpuData.some(g => g.vendor === 'apple')) {
              // 获取统一内存大小
              const memResult = await this.execLocalCommand('sysctl -n hw.memsize')
              if (memResult.success && memResult.stdout) {
                const unifiedMemory = parseInt(memResult.stdout.trim(), 10)
                gpuData.forEach(gpu => {
                  if (gpu.vendor === 'apple' && !gpu.memoryTotal) {
                    gpu.memoryTotal = unifiedMemory
                    gpu.memoryUsed = 0
                    gpu.unifiedMemory = true
                  }
                })
              }
            }
          }
        } else if (platform === 'linux') {
          // Linux: 尝试 nvidia-smi
          const gpuResult = await this.execLocalCommand('nvidia-smi --query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits 2>/dev/null')
          if (gpuResult.success && gpuResult.stdout) {
            const lines = gpuResult.stdout.trim().split('\n')
            gpuData = lines.filter(line => line.trim()).map((line, index) => {
              const parts = line.split(',').map(p => p.trim())
              if (parts.length < 3) return null
              return {
                id: parseInt(parts[0], 10) || index,
                name: parts[1],
                memoryTotal: parseInt(parts[2], 10) * 1024 * 1024, // MB to Bytes
                memoryUsed: parseInt(parts[3], 10) * 1024 * 1024,
                gpuUtil: parseInt(parts[4], 10) || 0,
                temperature: parseInt(parts[5], 10) || null,
                powerDraw: parts[6] && parts[6] !== '[N/A]' ? parseFloat(parts[6]) : null,
                powerLimit: parts[7] && parts[7] !== '[N/A]' ? parseFloat(parts[7]) : null,
                memoryUsagePercent: parts[2] > 0 ? ((parts[3] / parts[2]) * 100).toFixed(1) : 0,
                vendor: 'nvidia'
              }
            }).filter(g => g)
          }

          // 如果没有 NVIDIA GPU，尝试 AMD GPU
          if (gpuData.length === 0) {
            try {
              const amdResult = await this.execLocalCommand('rocm-smi --showproductname --showmeminfo --showuse --json 2>/dev/null')
              if (amdResult.success && amdResult.stdout) {
                // 解析 AMD GPU 信息（需要根据实际输出调整）
              }
            } catch (e) {
              // 忽略
            }
          }
        } else if (platform === 'windows') {
          // Windows: 尝试 nvidia-smi
          const gpuResult = await this.execLocalCommand('nvidia-smi --query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits 2>nul')
          if (gpuResult.success && gpuResult.stdout) {
            const lines = gpuResult.stdout.trim().split('\n')
            gpuData = lines.filter(line => line.trim()).map((line, index) => {
              const parts = line.split(',').map(p => p.trim())
              if (parts.length < 3) return null
              return {
                id: parseInt(parts[0], 10) || index,
                name: parts[1],
                memoryTotal: parseInt(parts[2], 10) * 1024 * 1024,
                memoryUsed: parseInt(parts[3], 10) * 1024 * 1024,
                gpuUtil: parseInt(parts[4], 10) || 0,
                temperature: parseInt(parts[5], 10) || null,
                powerDraw: parts[6] && parts[6] !== '[N/A]' ? parseFloat(parts[6]) : null,
                powerLimit: parts[7] && parts[7] !== '[N/A]' ? parseFloat(parts[7]) : null,
                memoryUsagePercent: parts[2] > 0 ? ((parts[3] / parts[2]) * 100).toFixed(1) : 0,
                vendor: 'nvidia'
              }
            }).filter(g => g)
          }

          // 如果没有 NVIDIA GPU，尝试 WMIC
          if (gpuData.length === 0) {
            try {
              const wmicResult = await this.execLocalCommand('wmic path win32_VideoController get Name,AdapterRAM /format:list')
              if (wmicResult.success && wmicResult.stdout) {
                const lines = wmicResult.stdout.trim().split('\n\n')
                gpuData = lines.filter(line => line.includes('Name=')).map((line, index) => {
                  const nameMatch = line.match(/Name=([^\r\n]+)/)
                  const ramMatch = line.match(/AdapterRAM=(\d+)/)
                  if (!nameMatch) return null
                  return {
                    id: index,
                    name: nameMatch[1].trim(),
                    memoryTotal: ramMatch && ramMatch[1] ? parseInt(ramMatch[1], 10) : null,
                    memoryUsed: null,
                    gpuUtil: null,
                    vendor: 'unknown'
                  }
                }).filter(g => g)
              }
            } catch (e) {
              console.warn('获取 Windows GPU 信息失败:', e.message)
            }
          }
        }
      } catch (e) {
        console.warn('获取 GPU 信息失败:', e.message)
      }

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
   * 解析磁盘大小（支持 KB, MB, GB, TB）
   * @param {string} sizeStr - 大小字符串 (如 "10G", "500M", "1.5T")
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
   * 连接到服务器（支持 localhost 和 ssh 类型）
   * @param {Object} config - SSH配置
   * @param {string} config.serverId - 服务器ID
   * @param {string} config.type - 服务器类型: 'ssh' | 'localhost'
   * @param {string} config.host - 服务器地址 (SSH 类型)
   * @param {number} config.port - SSH端口 (SSH 类型)
   * @param {string} config.username - 用户名 (SSH 类型)
   * @param {string} config.password - 密码 (SSH 类型)
   * @param {string} config.privateKey - 私钥内容 (SSH 类型)
   * @returns {Promise<Object>} 连接结果
   */
  async connect(config) {
    const { serverId, type, host, port = 22, username, password, privateKey } = config

    // 存储服务器配置
    this.addServer(config)

    // 检查是否已存在连接
    const existingConn = this.connections.get(serverId)
    if (existingConn) {
      // localhost 类型直接返回成功
      if (existingConn.type === 'localhost') {
        return { success: true, message: '本地宿主机已就绪' }
      }

      // SSH 类型：检查连接是否仍然有效
      // 这里简化处理：如果存在连接就认为有效
      // 更好的做法是发送一个测试命令来验证连接
      return { success: true, message: '已连接' }
    }

    // localhost 类型不需要 SSH 连接
    if (type === 'localhost') {
      // 标记为已连接（使用一个特殊标记）
      this.connections.set(serverId, { type: 'localhost' })
      return { success: true, message: '本地宿主机已就绪' }
    }

    // SSH 类型执行现有连接逻辑
    return new Promise((resolve, reject) => {
      const conn = new Client()

      const sshConfig = {
        host,
        port,
        username,
        readyTimeout: 30000
      }

      // 根据认证方式配置
      if (privateKey) {
        sshConfig.privateKey = privateKey
      } else if (password) {
        sshConfig.password = password
      } else {
        reject(new Error('需要提供密码或私钥'))
        return
      }

      conn
        .on('ready', () => {
          this.connections.set(serverId, conn)
          resolve({ success: true, message: '连接成功' })
        })
        .on('error', (err) => {
          console.error(`[SSH Manager] SSH连接失败: ${serverId}`, err.message)
          reject(new Error(`SSH连接失败: ${err.message}`))
        })
        .on('close', () => {
          this.connections.delete(serverId)
        })
        .connect(sshConfig)
    })
  }

  /**
   * 断开SSH连接
   * @param {string} serverId - 服务器ID
   */
  async disconnect(serverId) {
    const conn = this.connections.get(serverId)
    if (conn) {
      // localhost 类型不需要 end() 方法
      if (conn.type !== 'localhost') {
        conn.end()
      }
      this.connections.delete(serverId)
      // 清理系统类型缓存
      this.serverSystemCache.delete(serverId)
    }
  }

  /**
   * 执行命令（支持 localhost 和 ssh 类型）
   * @param {string} serverId - 服务器ID
   * @param {string} command - 要执行的命令
   * @returns {Promise<Object>} 执行结果
   */
  async execCommand(serverId, command) {
    let conn = this.connections.get(serverId)

    // 如果连接不存在，尝试自动建立连接
    if (!conn) {
      const server = this.getServerById(serverId)

      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在`)
      }

      if (server.type === 'localhost') {
        // localhost 类型自动建立连接
        conn = { type: 'localhost' }
        this.connections.set(serverId, conn)
      } else {
        // SSH 类型：尝试自动建立连接
        const connectResult = await this.connect({
          serverId: server.id,
          type: server.type || 'ssh',
          host: server.host,
          port: server.port,
          username: server.username,
          password: server.password,
          privateKey: server.privateKey
        })

        if (!connectResult.success) {
          throw new Error(`自动连接失败: ${connectResult.error}`)
        }

        conn = this.connections.get(serverId)
      }
    }

    // localhost 类型使用本地命令执行
    if (conn.type === 'localhost') {
      return await this.execLocalCommand(command)
    }

    // SSH 类型使用现有逻辑
    return new Promise((resolve, reject) => {
      conn.exec(command, (err, stream) => {
        if (err) {
          reject(new Error(`命令执行失败: ${err.message}`))
          return
        }

        let stdout = ''
        let stderr = ''

        stream
          .on('close', (code, signal) => {
            resolve({
              success: code === 0,
              code,
              signal,
              stdout: stdout.trim(),
              stderr: stderr.trim()
            })
          })
          .on('data', (data) => {
            stdout += data.toString()
          })
          .stderr.on('data', (data) => {
            stderr += data.toString()
          })
      })
    })
  }

  /**
   * 流式执行命令（实时返回输出）
   * @param {string} serverId - 服务器ID
   * @param {string} command - 要执行的命令
   * @param {Function} onData - 接收数据的回调函数 onData(stdout, stderr)
   * @param {Function} onClose - 命令结束时的回调函数 onClose(code, signal)
   * @returns {Function} 停止函数
   */
  execCommandStream(serverId, command, onData, onClose) {
    let conn = this.connections.get(serverId)

    // 如果连接不存在，抛出错误
    if (!conn) {
      throw new Error(`服务器 ${serverId} 未连接`)
    }

    // localhost 类型使用本地命令执行（流式）
    if (conn.type === 'localhost') {
      const { spawn } = require('child_process')

      const [cmd, ...args] = command.split(/\s+/)

      const child = spawn(cmd, args, {
        shell: true,
        env: process.env
      })

      // 处理 stdout
      child.stdout.on('data', (data) => {
        if (onData) {
          onData(data.toString(), '')
        }
      })

      // 处理 stderr
      child.stderr.on('data', (data) => {
        if (onData) {
          onData('', data.toString())
        }
      })

      // 处理关闭事件
      child.on('close', (code, signal) => {
        if (onClose) {
          onClose(code, signal)
        }
      })

      // 返回停止函数
      return () => {
        child.kill()
      }
    }

    // SSH 类型使用流式执行
    const stopCallbacks = []

    conn.exec(command, (err, stream) => {
      if (err) {
        if (onData) {
          onData('', `命令执行失败: ${err.message}\n`)
        }
        if (onClose) {
          onClose(-1, null)
        }
        return
      }

      let buffer = ''

      stream
        .on('data', (data) => {
          const output = data.toString()
          if (onData) {
            onData(output, '')
          }
        })
        .stderr.on('data', (data) => {
          const error = data.toString()
          if (onData) {
            onData('', error)
          }
        })
        .on('close', (code, signal) => {
          if (onClose) {
            onClose(code, signal)
          }
        })

      // 添加停止回调
      stopCallbacks.push(() => {
        stream.close()
      })
    })

    // 返回停止函数
    return () => {
      stopCallbacks.forEach(cb => cb())
    }
  }

  /**
   * 检查服务器上的环境是否存在
   * @param {string} serverId - 服务器ID
   * @param {string} envType - 环境类型 (conda | uv)
   */
  async checkEnvironment(serverId, envType) {
    if (envType === 'conda') {
      // 使用 bash -l 来加载完整环境
      const result = await this.execCommand(serverId, 'bash -l -c "conda --version"')
      if (!result.success) {
        // 如果上面的命令失败，尝试使用 source 激活基础环境
        const altResult = await this.execCommand(serverId, 'bash -c "source ~/.bashrc && conda --version"')
        return altResult.success
      }
      return result.success
    } else if (envType === 'uv') {
      const result = await this.execCommand(serverId, 'uv --version')
      return result.success
    }
    return false
  }

  /**
   * 智能查找命令在服务器上的路径
   * @param {string} serverId - 服务器ID
   * @param {string} commandName - 命令名称 (如: conda, uv, python3)
   * @returns {Promise<string|null>} 命令的绝对路径，如果找不到返回 null
   */
  async findCommandPath(serverId, commandName) {
    // 针对 conda 命令的特殊处理
    if (commandName === 'conda') {
      return await this.findCondaPath(serverId)
    }

    // 方法1: 使用 which 在登录 shell 中查找
    const whichResult = await this.execCommand(serverId, `bash -l -c "which ${commandName}"`)

    if (whichResult.success && whichResult.stdout && whichResult.stdout.trim()) {
      const path = whichResult.stdout.trim().split('\n')[0]
      return path
    }

    // 方法2: 使用 type -a 查找所有可能的路径
    const typeResult = await this.execCommand(serverId, `bash -l -c "type -a ${commandName}"`)
    if (typeResult.success && typeResult.stdout) {
      // type -a 输出格式: "command is /path/to/command"
      const matches = typeResult.stdout.match(/is\s+(\/[^\s]+)/g)
      if (matches && matches.length > 0) {
        const path = matches[0].replace('is ', '').trim()
        return path
      }
    }

    // 方法3: 尝试在常见位置查找（作为最后的备选方案）
    const commonLocations = [
      `/usr/local/bin/${commandName}`,
      `/usr/bin/${commandName}`,
      `/opt/homebrew/bin/${commandName}`,
      `/home/linuxbrew/.linuxbrew/bin/${commandName}`,
      `~/.local/bin/${commandName}`
    ]

    for (const location of commonLocations) {
      const testResult = await this.execCommand(serverId, `test -f ${location} && echo "exists"`)
      if (testResult.success && testResult.stdout && testResult.stdout.includes('exists')) {
        // 展开波浪号
        const expandedPathResult = await this.execCommand(serverId, `echo ${location}`)
        if (expandedPathResult.success && expandedPathResult.stdout) {
          const expandedPath = expandedPathResult.stdout.trim()
          console.log(`[SSH Manager] 在常见位置找到路径: ${expandedPath}`)
          return expandedPath
        }
      }
    }

    console.log(`[SSH Manager] 未找到命令 ${commandName}`)
    return null
  }

  /**
   * 专门用于查找 conda 路径的方法
   * @param {string} serverId - 服务器ID
   * @returns {Promise<string|null>} conda 的绝对路径，如果找不到返回 null
   */
  async findCondaPath(serverId) {
    console.log('[SSH Manager] 开始查找 conda 路径...')

    // 方法1: 使用 which 在登录 shell 中查找
    const whichResult = await this.execCommand(serverId, `bash -l -c "which conda"`)
    if (whichResult.success && whichResult.stdout && whichResult.stdout.trim() && !whichResult.stdout.includes('not found')) {
      const path = whichResult.stdout.trim().split('\n')[0]
      console.log(`[SSH Manager] 通过 which 找到 conda: ${path}`)
      return path
    }

    // 方法2: 尝试使用 source 初始化后查找
    const sourceCommands = [
      'bash -c "source ~/.bashrc && which conda 2>/dev/null"',
      'bash -c "source ~/.bash_profile && which conda 2>/dev/null"',
      'bash -c "source ~/.zshrc && which conda 2>/dev/null"',
      'bash -l -c "source ~/.bashrc && which conda 2>/dev/null"'
    ]

    for (const cmd of sourceCommands) {
      try {
        const result = await this.execCommand(serverId, cmd)
        if (result.success && result.stdout && result.stdout.trim() && !result.stdout.includes('not found')) {
          const path = result.stdout.trim().split('\n')[0]
          console.log(`[SSH Manager] 通过 source 初始化找到 conda: ${path}`)
          return path
        }
      } catch (e) {
        // 继续尝试下一个
      }
    }

    // 方法3: 直接在 conda 常见安装位置查找
    const condaLocations = [
      '~/miniconda3/bin/conda',
      '~/anaconda3/bin/conda',
      '~/miniforge3/bin/conda',
      '~/.conda/bin/conda',
      '/opt/miniconda3/bin/conda',
      '/opt/anaconda3/bin/conda',
      '/opt/miniforge3/bin/conda',
      '/usr/local/conda/bin/conda',
      '/usr/local/miniconda3/bin/conda',
      '/usr/local/anaconda3/bin/conda',
      '~/miniconda/bin/conda',
      '~/anaconda/bin/conda',
      '/opt/miniconda/bin/conda',
      '/opt/anaconda/bin/conda'
    ]

    for (const location of condaLocations) {
      try {
        // 使用 test -f 检查文件是否存在
        const testResult = await this.execCommand(serverId, `test -f ${location} && echo "exists"`)
        if (testResult.success && testResult.stdout && testResult.stdout.includes('exists')) {
          // 展开波浪号获取完整路径
          const expandedResult = await this.execCommand(serverId, `echo ${location}`)
          if (expandedResult.success && expandedResult.stdout) {
            const expandedPath = expandedResult.stdout.trim()
            console.log(`[SSH Manager] 在常见位置找到 conda: ${expandedPath}`)
            return expandedPath
          }
        }
      } catch (e) {
        // 继续尝试下一个
      }
    }

    // 方法4: 通过查找环境目录来推断 conda 路径
    // 如果有环境目录，可以推断出 conda 的位置
    const envBasePaths = [
      '~/miniconda3/envs',
      '~/anaconda3/envs',
      '~/miniforge3/envs',
      '/opt/miniconda3/envs',
      '/opt/anaconda3/envs',
      '/opt/miniforge3/envs'
    ]

    for (const envPath of envBasePaths) {
      try {
        const testResult = await this.execCommand(serverId, `test -d ${envPath} && echo "exists"`)
        if (testResult.success && testResult.stdout && testResult.stdout.includes('exists')) {
          // 推断 conda 路径（envs 目录的上一级/bin/conda）
          const condaPath = envPath.replace('/envs', '/bin/conda')
          const expandedResult = await this.execCommand(serverId, `echo ${condaPath}`)
          if (expandedResult.success && expandedResult.stdout) {
            const expandedPath = expandedResult.stdout.trim()
            // 验证 conda 文件确实存在
            const verifyResult = await this.execCommand(serverId, `test -f ${expandedPath} && echo "verified"`)
            if (verifyResult.success && verifyResult.stdout && verifyResult.stdout.includes('verified')) {
              console.log(`[SSH Manager] 通过环境目录推断找到 conda: ${expandedPath}`)
              return expandedPath
            }
          }
        }
      } catch (e) {
        // 继续尝试下一个
      }
    }

    console.log('[SSH Manager] 未找到 conda 命令')
    return null
  }

  /**
   * 获取服务器上的环境列表
   * @param {string} serverId - 服务器ID
   * @param {string} envType - 环境类型 (conda | uv)
   */
  async getEnvironmentList(serverId, envType) {
    try {
      if (envType === 'conda') {
        // 智能查找 conda 路径
        const condaBinPath = await this.findCommandPath(serverId, 'conda')
        

        // 构建命令列表
        const commands = []

        if (condaBinPath) {
          // 使用检测到的路径
          commands.push(`${condaBinPath} env list`)
          commands.push(`bash -l -c "${condaBinPath} env list"`)
        }

        // 备选方法 - 使用 bash -l 来加载环境后直接调用 conda
        commands.push(
          'bash -l -c "conda env list"',
          'bash -c "source ~/.bashrc && conda env list"',
          'bash -c "source ~/.bash_profile && conda env list"',
          'bash -c "source ~/.zshrc && conda env list"'
        )

        console.log('[SSH Manager] 尝试获取 conda 环境列表，共', commands.length, '个命令')

        for (let i = 0; i < commands.length; i++) {
          const cmd = commands[i]
          console.log(`[SSH Manager] 执行命令 ${i + 1}/${commands.length}:`, cmd)
          const result = await this.execCommand(serverId, cmd)
          console.log('[SSH Manager] 命令结果 - success:', result.success, 'stdout长度:', result.stdout?.length)

          if (result.success && result.stdout) {
            console.log('[SSH Manager] 命令输出（前200字符）:', result.stdout.substring(0, 200))
            // 检查输出是否包含环境列表的特征
            if (result.stdout.includes('base') || result.stdout.includes('#') || result.stdout.match(/\n[\w\-\.]+/)) {
              console.log('[SSH Manager] 检测到有效的 conda 输出，开始解析')
              return this.parseCondaOutput(result.stdout)
            }
          }
        }

        return { success: false, error: '获取conda环境列表失败，请确认conda已安装并配置好环境变量。已尝试 ' + commands.length + ' 个命令。' }
      } else if (envType === 'uv') {
        // uv 通常使用项目目录下的虚拟环境
        // 首先检查 uv 是否安装
        const uvPath = await this.findCommandPath(serverId, 'uv')

        if (uvPath) {
          console.log('[SSH Manager] 找到 uv:', uvPath)
          // 尝试使用 uv venv 列出虚拟环境
          const venvResult = await this.execCommand(serverId, `${uvPath} venv list 2>/dev/null || echo "no_venv"`)
          if (venvResult.success && venvResult.stdout && !venvResult.stdout.includes('no_venv')) {
            const environments = venvResult.stdout
              .trim()
              .split('\n')
              .filter(line => line.trim())
              .map(line => ({
                name: line.trim(),
                isCurrent: line.includes('*'),
                type: 'uv'
              }))
            if (environments.length > 0) {
              return { success: true, data: environments }
            }
          }
        }

        // 如果 uv venv list 不可用，尝试查找常见的虚拟环境位置
        const commonPaths = [
          './venv',
          './.venv',
          './env',
          '~/.local/share/uv'
        ]

        const environments = []
        for (const path of commonPaths) {
          const result = await this.execCommand(serverId, `test -d ${path} && echo "exists"`)
          if (result.success && result.stdout.includes('exists')) {
            environments.push({
              name: path,
              isCurrent: path === './.venv' || path === './venv',
              type: 'uv'
            })
          }
        }

        // 如果没找到，返回一个默认选项提示用户手动输入
        if (environments.length === 0) {
          environments.push({
            name: './.venv',
            isCurrent: true,
            type: 'uv'
          })
        }

        return { success: true, data: environments }
      }

      return { success: false, error: '不支持的环境类型' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 解析conda环境列表输出
   * @param {string} output - conda env list 命令的输出
   * @returns {Object} 解析后的环境列表
   */
  parseCondaOutput(output) {
    const environments = []
    const lines = output.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      // 跳过空行和注释行
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      // 匹配环境名称（可能以 * 标记当前环境）
      const match = trimmed.match(/^(\*?\s*)([\w\-\.]+)/)
      if (match) {
        const isCurrent = match[1].includes('*')
        const envName = match[2]
        environments.push({
          name: envName,
          isCurrent: isCurrent,
          type: 'conda'
        })
      }
    }

    return { success: true, data: environments }
  }

  /**
   * 检测服务器上所有可用的环境（conda、uv、system）
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Object>} 检测结果 { success: true, data: { conda: [], uv: [], system: [] } }
   */
  async detectEnvironments(serverId) {
    const result = {
      conda: [],
      uv: [],
      system: []
    }

    // 检测 conda 安装路径（不获取环境列表）
    try {
      const condaPath = await this.findCommandPath(serverId, 'conda')
      if (condaPath) {
        const basePath = condaPath.replace(/\/bin\/conda$/, '').replace(/\/conda$/, '')
        result.conda = [{
          name: 'Conda',
          path: basePath,
          type: 'conda'
        }]
      }
    } catch (error) {
      console.log('[SSH Manager] conda 检测失败:', error.message)
    }

    // 检测 uv 环境
    try {
      const uvResult = await this.getEnvironmentList(serverId, 'uv')
      if (uvResult.success && uvResult.data && uvResult.data.length > 0) {
        result.uv = uvResult.data.map(env => ({
          name: env.name,
          path: env.name,
          isCurrent: env.isCurrent,
          type: 'uv'
        }))
      }
    } catch (error) {
      console.log('[SSH Manager] uv 环境检测失败:', error.message)
    }

    // 检测系统 python
    try {
      const pythonPath = await this.findCommandPath(serverId, 'python3')
      if (pythonPath) {
        const pipPath = pythonPath.replace(/python3?$/, 'pip3')
        result.system = [{
          name: '系统 Python',
          path: pythonPath,
          pythonPath,
          pipPath,
          type: 'system'
        }]
      }
    } catch (error) {
      console.log('[SSH Manager] 系统 python 检测失败:', error.message)
    }

    return { success: true, data: result }
  }

  /**
   * 获取 conda 环境名称列表（用于下拉框）
   * @param {string} serverId - 服务器ID
   * @param {string} condaPath - conda 安装路径
   * @returns {Promise<Object>} 环境列表 { success: true, data: ['base', 'env1', ...] }
   */
  async getCondaEnvironments(serverId, condaPath) {
    try {
      const condaBin = condaPath.endsWith('/bin/conda') ? condaPath : `${condaPath}/bin/conda`
      const result = await this.execCommand(serverId, `${condaBin} env list`)

      if (result.success && result.stdout) {
        const envNames = []
        const lines = result.stdout.split('\n')

        for (const line of lines) {
          const trimmed = line.trim()
          // 跳过空行和注释行
          if (!trimmed || trimmed.startsWith('#')) {
            continue
          }
          // 提取环境名称
          const match = trimmed.match(/^(\*?\s*)([\w\-\.]+)/)
          if (match) {
            envNames.push(match[2])
          }
        }

        return { success: true, data: envNames }
      }

      return { success: false, error: result.stderr || '获取环境列表失败' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取服务器的GPU信息用于服务选择
   * @param {string} serverId - 服务器ID
   */
  async getServerGPUs(serverId) {
    try {
      const result = await this.getServerInfo(serverId)
      if (result.success && result.data && result.data.gpus) {
        return {
          success: true,
          data: result.data.gpus.map((gpu, index) => ({
            id: gpu.id || index,
            name: gpu.name || `GPU ${index}`,
            memoryTotal: gpu.memoryTotal,
            memoryUsed: gpu.memoryUsed,
            memoryAvailable: (gpu.memoryTotal || 0) - (gpu.memoryUsed || 0),
            memoryUsagePercent: gpu.memoryUsagePercent,
            gpuUtil: gpu.gpuUtil
          }))
        }
      }
      return { success: false, error: '获取GPU信息失败' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 启动模型服务
   * @param {string} serverId - 服务器ID
   * @param {Object} serviceConfig - 服务配置
   */
  async startService(serverId, serviceConfig) {
    const { envType, envName, startCommand, logPath, serviceName } = serviceConfig

    // 创建日志目录（如果不存在）
    const logDir = logPath.substring(0, logPath.lastIndexOf('/'))
    await this.execCommand(serverId, `mkdir -p ${logDir}`)

    // 从用户的启动命令中提取纯净的vllm/lmdeploy命令
    // 去掉 export CUDA_VISIBLE_DEVICES、conda run、nohup、日志重定向等
    let cleanCommand = startCommand

    // 去掉 CUDA_VISIBLE_DEVICES 设置（我们会单独处理）
    cleanCommand = cleanCommand.replace(/export\s+CUDA_VISIBLE_DEVICES=[^&]+&&\s*/gi, '')

    // 去掉 conda run 部分
    cleanCommand = cleanCommand.replace(/conda\s+run\s+-n\s+\S+\s+(--no-capture-output\s+)?/gi, '')

    // 去掉 uv run 部分
    cleanCommand = cleanCommand.replace(/uv\s+run\s+(--with\s+\S+\s+)?/gi, '')

    // 去掉 nohup 前缀
    cleanCommand = cleanCommand.replace(/^nohup\s+/gi, '')

    // 去掉日志重定向和后台运行符
    cleanCommand = cleanCommand.replace(/\s*>\s*\S+\s*2>&1\s*&\s*$/gi, '')
    cleanCommand = cleanCommand.replace(/\s*&\s*$/gi, '')

    cleanCommand = cleanCommand.trim()

    // 从命令中提取端口号
    let port = null
    const portMatch = cleanCommand.match(/--port\s+(\d+)/)
    if (portMatch) {
      port = parseInt(portMatch[1], 10)
    } else {
      const serverPortMatch = cleanCommand.match(/--server-port\s+(\d+)/)
      if (serverPortMatch) {
        port = parseInt(serverPortMatch[1], 10)
      }
    }

    if (port) {
      // 检查端口是否被占用
      const portCheckResult = await this.execCommand(serverId, `netstat -tuln 2>/dev/null | grep :${port}\\s || ss -tuln | grep :${port}\\s || lsof -i :${port} 2>/dev/null`)

      if (portCheckResult.success && portCheckResult.stdout.trim()) {
        throw new Error(`端口 ${port} 已被占用，请使用其他端口或停止占用该端口的进程`)
      }
    }

    // 提取 GPU 设置
    const gpuMatch = startCommand.match(/CUDA_VISIBLE_DEVICES=(\d+(?:,\d+)*)/)
    const gpuEnvVar = gpuMatch ? `export CUDA_VISIBLE_DEVICES=${gpuMatch[1]} && ` : ''

    // 构建完整的启动命令
    // 对于 conda，需要先初始化 conda 环境
    let fullCommand = ''
    if (envType === 'conda' && envName) {
      // 使用统一的 findCondaPath 方法查找 conda
      const condaPath = await this.findCondaPath(serverId)

      if (!condaPath) {
        throw new Error('未找到 conda 安装，请确保 conda 已正确安装')
      }

      const condaBin = condaPath.endsWith('conda') ? condaPath : `${condaPath}/conda`
      console.log(`[startService] 使用 conda 路径: ${condaBin}`)

      // 在指定的 conda 环境中启动服务
      fullCommand = `bash -l -c "${gpuEnvVar}${condaBin} run -n ${envName} --no-capture-output ${cleanCommand} > ${logPath} 2>&1 &"`
    } else if (envType === 'uv' && envName) {
      // UV 环境使用虚拟环境的 python
      fullCommand = `bash -c "${gpuEnvVar}${envName}/bin/python -m ${cleanCommand} > ${logPath} 2>&1 &"`
    } else {
      // 没有指定环境，直接执行
      fullCommand = `bash -c "${gpuEnvVar}${cleanCommand} > ${logPath} 2>&1 &"`
    }

    // 执行启动命令
    const result = await this.execCommand(serverId, fullCommand)

    if (!result.success) {
      throw new Error(`启动服务失败: ${result.stderr}`)
    }

    // 检查stderr输出，可能有错误信息
    if (result.stderr && result.stderr.trim()) {
      console.warn('[startService] 命令stderr输出:', result.stderr)
    }

    // 等待进程启动
    await new Promise(resolve => setTimeout(resolve, 3000))

    // 使用更健壮的方式检查服务是否成功启动
    // 结合端口检查和进程检查，类似 checkServiceRealStatus 的逻辑
    const statusConfig = { port, startCommand }
    const statusResult = await this.checkServiceRealStatus(serverId, statusConfig)

    if (statusResult.running && statusResult.pid) {
      return {
        success: true,
        pid: statusResult.pid,
        message: '服务启动成功'
      }
    }

    // 如果服务未运行，检查日志文件获取更多信息
    try {
      const logResult = await this.execCommand(serverId, `tail -100 ${logPath}`)
      if (logResult.success && logResult.stdout) {
        throw new Error(`服务启动失败，未能找到运行中的进程。\n日志内容:\n${logResult.stdout}`)
      }
    } catch (error) {
      // 日志读取失败或日志内容已在上面的 throw 中处理
    }

    throw new Error('服务启动失败，未能找到运行中的进程')
  }

  /**
   * 停止模型服务
   * @param {string} serverId - 服务器ID
   * @param {number} pid - 进程ID
   * @param {string} startCommand - 启动命令（用于查找进程）
   */
  async stopService(serverId, pid, startCommand) {
    const killedPids = []

    // 从启动命令中提取模型路径，用于精确查找进程
    let modelPath = null
    if (startCommand) {
      const pathMatch = startCommand.match(/(?:vllm serve|lmdeploy serve api_server)\s+(\S+)/)
      if (pathMatch) {
        modelPath = pathMatch[1]
      }
    }

    // 从启动命令中提取端口号
    let port = null
    if (startCommand) {
      const portMatch = startCommand.match(/--port\s+(\d+)|--server-port\s+(\d+)/)
      if (portMatch) {
        port = portMatch[1] || portMatch[2]
      }
    }

    // 【关键】在杀死主进程之前，先记录所有 GPU 上的 VLLM worker 进程
    let preKillWorkerPids = []
    try {
      const gpuProcesses = await this.gpuManager.getAllGPUProcesses(serverId)

      // 找出所有 VLLM::Worker_TP 进程
      preKillWorkerPids = gpuProcesses
        .filter(p => p.name && p.name.includes('VLLM::Worker_TP'))
        .map(p => p.pid)
    } catch (error) {
      // GPU 检测失败，继续
    }

    // 方法1：如果有 PID，杀死整个进程树
    if (pid) {
      try {
        // 获取该进程的所有子进程
        const childrenCmd = `pgrep -P ${pid}`
        const childrenResult = await this.execCommand(serverId, childrenCmd)

        // 首先杀死所有子进程
        if (childrenResult.success && childrenResult.stdout.trim()) {
          const childPids = childrenResult.stdout.trim().split('\n').filter(p => p.trim())
          for (const childPid of childPids) {
            try {
              await this.execCommand(serverId, `kill -9 ${childPid.trim()}`)
              killedPids.push(childPid.trim())
            } catch (e) {
              // 子进程可能已经不存在
            }
          }
        }

        // 杀死主进程
        try {
          await this.execCommand(serverId, `kill -9 ${pid}`)
          killedPids.push(pid.toString())
        } catch (e) {
          // 主进程可能已经不存在
        }
      } catch (error) {
        // 继续尝试其他方法
      }
    }

    // 方法2：通过模型路径查找所有相关进程并杀死
    if (modelPath) {
      try {
        // 查找所有包含该模型路径的 Python 进程
        const findCmd = `ps aux | grep -E "${modelPath}" | grep -v grep | awk '{print $2}'`
        const result = await this.execCommand(serverId, findCmd)

        if (result.success && result.stdout.trim()) {
          const pids = result.stdout.trim().split('\n').filter(p => p.trim())

          // 杀死所有匹配的进程
          for (const foundPid of pids) {
            try {
              await this.execCommand(serverId, `kill -9 ${foundPid.trim()}`)
              if (!killedPids.includes(foundPid.trim())) {
                killedPids.push(foundPid.trim())
              }
            } catch (e) {
              // 进程可能已经不存在
            }
          }
        }
      } catch (error) {
        // 继续尝试下一个方法
      }
    }

    // 方法3：通过端口查找进程并杀死
    if (port) {
      try {
        // 使用 lsof 查找占用该端口的进程
        const lsofCmd = `lsof -ti :${port}`
        const result = await this.execCommand(serverId, lsofCmd)

        if (result.success && result.stdout.trim()) {
          const pids = result.stdout.trim().split('\n').filter(p => p.trim())

          // 杀死所有占用该端口的进程
          for (const foundPid of pids) {
            try {
              await this.execCommand(serverId, `kill -9 ${foundPid.trim()}`)
              if (!killedPids.includes(foundPid.trim())) {
                killedPids.push(foundPid.trim())
              }
            } catch (e) {
              // 进程可能已经不存在
            }
          }
        }
      } catch (error) {
        // lsof 可能失败，继续尝试
      }
    }

    // 方法4：使用 pkill 根据 Python 命令模式查找
    try {
      // 查找所有 vllm 或 lmdeploy 相关的 Python 进程
      let pkillPattern = 'vllm'
      if (startCommand && startCommand.includes('lmdeploy')) {
        pkillPattern = 'lmdeploy'
      }

      // 使用 pkill 列出匹配的进程（不杀）
      const pgrepCmd = `pgrep -f "${pkillPattern}"`
      const pgrepResult = await this.execCommand(serverId, pgrepCmd)

      if (pgrepResult.success && pgrepResult.stdout.trim()) {
        let pids = pgrepResult.stdout.trim().split('\n').filter(p => p.trim())

        // 如果有端口号，进一步过滤
        if (port) {
          const filteredPids = []
          for (const p of pids) {
            try {
              const cmdResult = await this.execCommand(serverId, `ps -p ${p} -o args --no-headers`)
              if (cmdResult.success && cmdResult.stdout.includes(port)) {
                filteredPids.push(p)
              }
            } catch (e) {
              // 继续处理
            }
          }
          pids = filteredPids
        }

        for (const foundPid of pids) {
          try {
            await this.execCommand(serverId, `kill -9 ${foundPid}`)
            if (!killedPids.includes(foundPid.toString())) {
              killedPids.push(foundPid.toString())
            }
          } catch (e) {
            // 进程可能已经不存在
          }
        }
      }
    } catch (error) {
      // 继续处理
    }

    // 等待一下，确保进程被完全杀死
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 方法5：使用 GPU 管理器处理 GPU 上的进程（精确匹配）
    try {
      // 获取所有 GPU 进程
      const gpuProcesses = await this.gpuManager.getAllGPUProcesses(serverId)

      if (gpuProcesses.length > 0) {
        // 服务配置，用于匹配
        const serviceConfig = { modelPath, port, pid }

        // 检查每个 GPU 进程是否属于当前要停止的服务
        for (const process of gpuProcesses) {
          try {
            const isTargetProcess = await this.gpuManager.isProcessMatchService(
              serverId,
              process,
              serviceConfig
            )

            if (isTargetProcess) {
              const gpuPid = process.pid
              try {
                // 先尝试优雅停止
                await this.execCommand(serverId, `kill ${gpuPid}`)
                await new Promise(resolve => setTimeout(resolve, 500))

                // 检查进程是否还在，如果还在则强制杀死
                const checkResult = await this.execCommand(serverId, `ps -p ${gpuPid} --no-headers`)
                if (checkResult.success && checkResult.stdout.trim()) {
                  await this.execCommand(serverId, `kill -9 ${gpuPid}`)
                }

                if (!killedPids.includes(gpuPid.toString())) {
                  killedPids.push(gpuPid.toString())
                }
              } catch (e) {
                // 可能已经不存在，继续处理
              }
            }
          } catch (e) {
            // 继续处理
          }
        }
      }
    } catch (error) {
      // GPU 管理器可能不可用，但已经尝试了其他方法
    }

    // 再次等待，确保所有 GPU 进程都被杀死
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 方法6：杀死预先记录的 VLLM worker 进程
    // 这是关键步骤：即使主进程已死，也要确保杀死所有 worker
    if (preKillWorkerPids.length > 0) {
      for (const workerPid of preKillWorkerPids) {
        try {
          // 检查进程是否还存在
          const checkResult = await this.execCommand(serverId, `ps -p ${workerPid} --no-headers`)

          if (checkResult.success && checkResult.stdout.trim()) {
            // 进程还在，杀死它
            await this.execCommand(serverId, `kill -9 ${workerPid}`)
            if (!killedPids.includes(workerPid.toString())) {
              killedPids.push(workerPid.toString())
            }
          }
        } catch (e) {
          // 进程可能已经不存在
        }
      }
    }

    // 最终等待，确保所有进程都被完全杀死
    await new Promise(resolve => setTimeout(resolve, 1500))

    // 验证：使用 nvidia-smi 检查 GPU 上是否还有 Python 进程
    if (killedPids.length > 0 || modelPath) {
      try {
        // 使用 nvidia-smi 检查 GPU 进程
        const gpuCheckCmd = `nvidia-smi pmon -c 1 -o U | grep python | awk '{print $2}' | sort -u`
        const gpuResult = await this.execCommand(serverId, gpuCheckCmd)

        if (gpuResult.success && gpuResult.stdout.trim()) {
          const gpuPids = gpuResult.stdout.trim().split('\n').filter(p => p.trim())

          // 对于每个 GPU 上的 Python 进程，检查是否与我们的服务相关
          for (const gpuPid of gpuPids) {
            try {
              // 检查该进程的命令行参数
              const cmdResult = await this.execCommand(serverId, `ps -p ${gpuPid} -o args --no-headers`)

              if (cmdResult.success && cmdResult.stdout) {
                const cmd = cmdResult.stdout
                // 如果命令中包含我们的模型路径或 vllm/lmdeploy 关键字，也要杀死
                if ((modelPath && cmd.includes(modelPath)) ||
                    cmd.includes('vllm') ||
                    cmd.includes('lmdeploy')) {
                  try {
                    await this.execCommand(serverId, `kill -9 ${gpuPid}`)
                    if (!killedPids.includes(gpuPid.toString())) {
                      killedPids.push(gpuPid.toString())
                    }
                  } catch (e) {
                    // 可能已经不存在
                  }
                }
              }
            } catch (e) {
              // 继续处理
            }
          }
        }
      } catch (error) {
        // nvidia-smi 可能不可用或失败，但至少我们已经尝试了其他方法
      }
    }

    // 最终检查：确认所有相关进程都已停止
    if (killedPids.length > 0) {
      return {
        success: true,
        message: `已停止 ${killedPids.length} 个相关进程 (PID: ${[...new Set(killedPids)].join(', ')})`
      }
    }

    // 如果所有方法都没有找到进程，可能已经停止了
    return { success: true, message: '服务已停止（未发现运行中的进程）' }
  }

  /**
   * 检查服务状态
   * @param {string} serverId - 服务器ID
   * @param {number} pid - 进程ID
   */
  async checkServiceStatus(serverId, pid) {
    if (!pid) {
      return { running: false }
    }

    const result = await this.execCommand(serverId, `ps -p ${pid} -o pid,cmd --no-headers`)
    return { running: result.success && result.stdout.includes(pid.toString()) }
  }

  /**
   * 检查服务的完整状态（通过端口和启动命令）
   * @param {string} serverId - 服务器ID
   * @param {Object} serviceConfig - 服务配置
   * @param {string} serviceConfig.port - 服务端口
   * @param {string} serviceConfig.startCommand - 启动命令
   * @returns {Promise<Object>} 服务状态信息
   */
  async checkServiceRealStatus(serverId, serviceConfig) {
    const { port, startCommand } = serviceConfig

    // 检查1: 检查端口是否在监听
    let portListening = false
    let portPid = null

    if (port) {
      // 使用多种方式检查端口是否在监听
      const portCheckCommands = [
        `ss -tuln | grep :${port}\\s`,
        `netstat -tuln 2>/dev/null | grep :${port}\\s`,
        `lsof -i :${port} 2>/dev/null | grep LISTEN`
      ]

      for (const cmd of portCheckCommands) {
        try {
          const result = await this.execCommand(serverId, cmd)
          if (result.success && result.stdout.trim()) {
            portListening = true

            // 尝试从 lsof 输出中提取 PID
            if (cmd.includes('lsof')) {
              const pidMatch = result.stdout.match(/LISTEN\s+(\d+)/)
              if (pidMatch) {
                portPid = parseInt(pidMatch[1], 10)
              }
            }
            break
          }
        } catch (e) {
          // 继续尝试下一个命令
        }
      }
    }

    // 检查2: 检查是否有匹配启动命令的进程在运行
    let processRunning = false
    let processPid = null

    if (startCommand) {
      // 从启动命令中提取关键搜索词
      const pathMatch = startCommand.match(/(?:vllm serve|lmdeploy serve api_server)\s+(\S+)/)
      const searchKeyword = pathMatch ? pathMatch[1] : 'vllm'

      // 从命令中提取端口号用于更精确的匹配
      const portMatch = startCommand.match(/--port\s+(\d+)|--server-port\s+(\d+)/)
      const cmdPort = portMatch ? (portMatch[1] || portMatch[2]) : null

      // 构建搜索命令，优先使用端口和模型路径的组合来精确匹配
      let searchPattern = searchKeyword
      if (cmdPort) {
        searchPattern += `.*--port.*${cmdPort}|${searchPattern}.*--server-port.*${cmdPort}`
      }

      // 使用 ps 命令查找匹配的进程
      const searchCommands = [
        `ps aux | grep -E "${searchPattern}" | grep -v grep`,
        `pgrep -f "${searchKeyword}"`
      ]

      for (const cmd of searchCommands) {
        try {
          const result = await this.execCommand(serverId, cmd)
          if (result.success && result.stdout.trim()) {
            if (cmd.includes('ps aux')) {
              // 从 ps aux 输出中提取 PID
              const lines = result.stdout.trim().split('\n')
              for (const line of lines) {
                // 验证端口匹配（如果指定了端口）
                if (cmdPort && !line.includes(`--port ${cmdPort}`) && !line.includes(`--server-port ${cmdPort}`)) {
                  continue
                }
                const pidMatch = line.match(/^\S+\s+(\d+)/)
                if (pidMatch) {
                  processPid = parseInt(pidMatch[1], 10)
                  processRunning = true
                  break
                }
              }
              if (processRunning) break
            } else {
              // pgrep 输出直接是 PID
              const pids = result.stdout.trim().split('\n').filter(p => p.trim())
              if (pids.length > 0) {
                processPid = parseInt(pids[0], 10)
                processRunning = true
                break
              }
            }
          }
        } catch (e) {
          // 继续尝试下一个命令
        }
        if (processRunning) break
      }
    }

    // 综合判断状态
    // 如果端口在监听 且 有匹配的进程在运行，则认为服务正在运行
    const isRunning = portListening && processRunning

    return {
      running: isRunning,
      portListening,
      processRunning,
      pid: processPid || portPid
    }
  }

  /**
   * 读取日志内容
   * @param {string} serverId - 服务器ID
   * @param {string} logPath - 日志文件路径
   * @param {number} lines - 读取行数（最后N行）
   */
  async readLog(serverId, logPath, lines = 100) {
    const result = await this.execCommand(serverId, `tail -n ${lines} ${logPath}`)
    return result.success ? result.stdout : ''
  }

  /**
   * 实时监控日志（支持 localhost 和 ssh 类型）
   * @param {string} serverId - 服务器ID
   * @param {string} logPath - 日志文件路径
   * @param {Function} onData - 接收日志数据的回调函数
   */
  async tailLog(serverId, logPath, onData) {
    const conn = this.connections.get(serverId)
    if (!conn) {
      throw new Error('服务器未连接')
    }

    // localhost 类型使用本地 tail -f
    if (conn.type === 'localhost') {
      const { spawn } = require('child_process')
      const tail = spawn('tail', ['-f', logPath])

      tail.stdout.on('data', (data) => {
        onData(data.toString())
      })

      tail.stderr.on('data', (data) => {
        console.error('Log tail error:', data.toString())
      })

      tail.on('close', () => {
        // Done
      })

      // 返回停止函数
      return () => tail.kill()
    }

    // SSH 类型使用现有逻辑
    return new Promise((resolve, reject) => {
      conn.exec(`tail -f ${logPath}`, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        stream
          .on('data', (data) => {
            onData(data.toString())
          })
          .on('close', () => {
            resolve()
          })
          .stderr.on('data', (data) => {
            console.error('Log tail error:', data.toString())
          })

        // 返回一个停止监控的函数
        return () => stream.close()
      })
    })
  }

  /**
   * 列出目录内容（支持 localhost 和 ssh 类型）
   * @param {string} serverId - 服务器ID
   * @param {string} path - 目录路径
   * @returns {Promise<Object>} 目录内容列表
   */
  async listDirectory(serverId, path) {
    const conn = this.connections.get(serverId)
    if (!conn) {
      throw new Error('服务器未连接，请先连接服务器')
    }

    // localhost 类型直接使用 execCommand
    if (conn.type === 'localhost') {
      // 使用 ls 命令列出目录
      const result = await this.execCommand(serverId, `ls -la "${path}" 2>/dev/null`)
      if (!result.success) {
        return { success: false, error: result.stderr || '无法读取目录内容' }
      }

      const items = result.stdout.trim().split('\n').slice(1) // 跳过第一行（总计）
      const dirs = []
      const files = []

      items.forEach(item => {
        if (!item.trim()) return
        const parts = item.trim().split(/\s+/)
        if (parts.length < 8) return
        const name = parts.slice(8).join(' ')
        if (name && name !== '.' && name !== '..') {
          if (item.startsWith('d')) {
            dirs.push(name)
          } else {
            files.push(name)
          }
        }
      })

      return {
        success: true,
        data: {
          directories: dirs,
          files: files,
          items: [...dirs, ...files].map(item => ({
            name: item,
            isDirectory: dirs.includes(item)
          }))
        }
      }
    }

    // SSH 类型使用现有逻辑
    // 使用 find 命令来安全地列出目录内容，避免潜在的安全问题
    const command = `find "${path}" -maxdepth 1 -type d -printf '%f/\n' -o -type f -printf '%f\n' 2>/dev/null | head -100`
    
    return new Promise((resolve, reject) => {
      conn.exec(command, (err, stream) => {
        if (err) {
          reject(new Error(`列出目录失败: ${err.message}`))
          return
        }

        let stdout = ''
        let stderr = ''

        stream
          .on('close', (code, signal) => {
            if (code !== 0 || stderr) {
              // 如果 find 命令失败或有错误输出，尝试使用 ls 命令作为备选方案
              this.execCommand(serverId, `ls -la "${path}" 2>/dev/null | tail -n +2 | head -100`)
                .then(lsResult => {
                  if (lsResult.success && lsResult.stdout) {
                    const items = lsResult.stdout.trim().split('\n').filter(item => item.trim())
                    const dirs = []
                    const files = []
                    
                    items.forEach(item => {
                      if (item.startsWith('d')) {
                        const name = item.split(/\s+/).slice(8).join(' ')
                        if (name && name !== '.' && name !== '..') {
                          dirs.push(name)
                        }
                      } else {
                        const name = item.split(/\s+/).slice(8).join(' ')
                        if (name && name !== '.' && name !== '..') {
                          files.push(name)
                        }
                      }
                    })
                    
                    resolve({
                      success: true,
                      data: { 
                        directories: dirs,
                        files: files,
                        items: [...dirs, ...files].map(item => ({
                          name: item,
                          isDirectory: dirs.includes(item)
                        }))
                      }
                    })
                  } else {
                    // 再尝试一个更简单的 ls 命令
                    this.execCommand(serverId, `ls -1 "${path}" 2>/dev/null | head -100`)
                      .then(simpleLsResult => {
                        if (simpleLsResult.success && simpleLsResult.stdout) {
                          const items = simpleLsResult.stdout.trim().split('\n').filter(item => item.trim() && item !== '.' && item !== '..')
                          // 对于简单的 ls -1 输出，我们无法区分目录和文件，所以将所有项目标记为文件
                          // 为了更准确地识别目录，我们可以使用 test 命令检查每个项目
                          const resultItems = []
                          
                          // 处理项目并尝试区分目录和文件
                          items.forEach(item => {
                            resultItems.push({
                              name: item,
                              isDirectory: false // 默认为文件，实际应用中可能需要进一步检查
                            })
                          })
                          
                          resolve({
                            success: true,
                            data: { 
                              directories: [],
                              files: items,
                              items: resultItems
                            }
                          })
                        } else {
                          resolve({
                            success: false,
                            error: stderr || lsResult.error || simpleLsResult.error || '无法读取目录内容'
                          })
                        }
                      })
                      .catch(simpleLsError => {
                        resolve({
                          success: false,
                          error: stderr || lsResult.error || simpleLsError.message || '无法读取目录内容'
                        })
                      })
                  }
                })
                .catch(lsError => {
                  // 如果 ls -la 命令也失败，尝试使用最简单的 ls 命令
                  this.execCommand(serverId, `ls -1 "${path}" 2>/dev/null | head -100`)
                    .then(simpleLsResult => {
                      if (simpleLsResult.success && simpleLsResult.stdout) {
                        const items = simpleLsResult.stdout.trim().split('\n').filter(item => item.trim() && item !== '.' && item !== '..')
                        const resultItems = []
                        
                        items.forEach(item => {
                          resultItems.push({
                            name: item,
                            isDirectory: false // 默认为文件
                          })
                        })
                        
                        resolve({
                          success: true,
                          data: { 
                            directories: [],
                            files: items,
                            items: resultItems
                          }
                        })
                      } else {
                        resolve({
                          success: false,
                          error: stderr || lsError.message || simpleLsResult.error || '无法读取目录内容'
                        })
                      }
                    })
                    .catch(simpleLsError => {
                      resolve({
                        success: false,
                        error: stderr || lsError.message || simpleLsError.message || '无法读取目录内容'
                      })
                    })
                })
            } else {
              // 处理 find 命令的输出
              const items = stdout.trim().split('\n').filter(item => item.trim())
              const dirs = items.filter(item => item.endsWith('/')).map(item => item.slice(0, -1))
              const files = items.filter(item => !item.endsWith('/'))
              
              resolve({
                success: true,
                data: { 
                  directories: dirs,
                  files: files,
                  items: [...dirs, ...files].map(item => ({
                    name: item,
                    isDirectory: dirs.includes(item)
                  }))
                }
              })
            }
          })
          .on('data', (data) => {
            stdout += data.toString()
          })
          .stderr.on('data', (data) => {
            stderr += data.toString()
          })
      })
    })
  }

  /**
   * 获取服务器基础信息（使用脚本方式，支持 localhost 和 ssh 类型）
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Object>} 服务器信息
   */
  async getServerInfo(serverId) {
    let conn = this.connections.get(serverId)

    // 如果连接不存在，尝试自动建立连接
    if (!conn) {
      const server = this.getServerById(serverId)

      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在`)
      }

      if (server.type === 'localhost') {
        // localhost 类型自动建立连接
        conn = { type: 'localhost' }
        this.connections.set(serverId, conn)
      } else {
        // SSH 类型：尝试自动建立连接
        const connectResult = await this.connect({
          serverId: server.id,
          type: server.type || 'ssh',
          host: server.host,
          port: server.port,
          username: server.username,
          password: server.password,
          privateKey: server.privateKey
        })

        if (!connectResult.success) {
          throw new Error(`自动连接失败: ${connectResult.message}`)
        }

        conn = this.connections.get(serverId)
      }
    }

    try {
      let jsonOutput = ''

      // localhost 类型使用本地脚本获取信息
      if (conn.type === 'localhost') {
        // 根据本地系统类型选择脚本
        const localType = process.platform === 'darwin' ? 'darwin' :
                          process.platform === 'win32' ? 'windows' : 'linux'
        jsonOutput = await this.getServerInfoByScript('localhost', localType)
      } else {
        // SSH 类型：检测系统类型后执行对应的脚本
        const systemType = await this.getSystemTypeForServer(serverId)
        const osType = this.getServerById(serverId)?.osType || 'linux'

        // 映射系统类型到脚本类型
        const scriptType = this.getScriptType(systemType, osType)

        jsonOutput = await this.getServerInfoByScript(serverId, scriptType)
      }

      // 解析 JSON 输出
      const systemData = systemInfoParser.parse(jsonOutput)

      return {
        success: true,
        data: {
          os: systemData.os,
          cpu: systemData.cpu,
          memory: systemData.memory,
          disks: systemData.disks,
          gpus: systemData.gpus
        }
      }
    } catch (error) {
      console.error('获取服务器信息失败:', error.message)
      throw new Error(`获取服务器信息失败: ${error.message}`)
    }
  }

  /**
   * 获取服务器的系统类型（返回字符串类型）
   * @param {string} serverId - 服务器ID
   * @returns {string} 系统类型 ('ubuntu', 'centos', 'linux', etc.)
   */
  async getSystemTypeForServer(serverId) {
    // 检查缓存
    if (this.serverSystemCache.has(serverId)) {
      return this.serverSystemCache.get(serverId)
    }

    // 检测系统类型
    const systemType = await this.systemDetector.detectSystemType(serverId)

    // 缓存结果
    this.serverSystemCache.set(serverId, systemType)

    return systemType
  }

  /**
   * 使用脚本获取服务器信息（支持 localhost 和 SSH）
   * @param {string} serverIdOrType - 服务器ID 或 'localhost'
   * @param {string} scriptType - 脚本类型 (ubuntu, centos, linux, darwin, windows)
   * @returns {Promise<string>} JSON 格式的系统信息
   */
  async getServerInfoByScript(serverIdOrType, scriptType) {
    const isLocalhost = serverIdOrType === 'localhost'

    // 获取脚本内容
    const scriptContent = scriptManager.getScriptContent(scriptType)

    if (isLocalhost) {
      // 本地执行脚本
      return await this.executeLocalScript(scriptContent, scriptType)
    } else {
      // 远程执行脚本
      return await this.executeRemoteScript(serverIdOrType, scriptContent)
    }
  }

  /**
   * 本地执行脚本
   * @param {string} scriptContent - 脚本内容
   * @param {string} scriptType - 脚本类型
   * @returns {Promise<string>} JSON 输出
   */
  async executeLocalScript(scriptContent, scriptType) {
    try {
      const platform = process.platform

      // Windows 使用 PowerShell
      if (platform === 'win32' || scriptType === 'windows') {
        // 对于 PowerShell 脚本，需要使用 -File 参数或 -Command 参数
        // 这里我们使用 -Command 直接执行脚本内容
        const psContent = scriptContent
        const { stdout } = await execAsync(
          `powershell.exe -ExecutionPolicy Bypass -NoProfile -Command -`,
          {
            input: psContent,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
            timeout: 30000,
            shell: true
          }
        )
        return stdout.trim()
      }

      // Unix/Linux/macOS 使用 bash
      const { stdout } = await execAsync(scriptContent, {
        shell: '/bin/bash',
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
        env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' }
      })
      return stdout.trim()
    } catch (error) {
      console.error('本地脚本执行失败:', error.message)
      throw new Error(`本地脚本执行失败: ${error.message}`)
    }
  }

  /**
   * 远程执行脚本（通过 SSH）
   * @param {string} serverId - 服务器ID
   * @param {string} scriptContent - 脚本内容
   * @returns {Promise<string>} JSON 输出
   */
  async executeRemoteScript(serverId, scriptContent) {
    return new Promise((resolve, reject) => {
      const conn = this.connections.get(serverId)
      if (!conn || conn.type === 'localhost') {
        reject(new Error('无效的连接'))
        return
      }

      conn.exec(scriptContent, (err, stream) => {
        if (err) {
          reject(new Error(`脚本执行失败: ${err.message}`))
          return
        }

        let stdout = ''
        let stderr = ''

        stream
          .on('close', (code) => {
            if (code === 0) {
              resolve(stdout.trim())
            } else {
              reject(new Error(`脚本执行失败 (退出码: ${code}): ${stderr || stdout}`))
            }
          })
          .on('data', (data) => {
            stdout += data.toString()
          })
          .stderr.on('data', (data) => {
            stderr += data.toString()
          })
      })
    })
  }

  /**
   * 映射解析器类型到脚本类型
   * @param {string} parserType - 解析器类型
   * @param {string} osType - 操作系统类型
   * @returns {string} 脚本类型
   */
  getScriptType(parserType, osType) {
    // 根据 osType 映射到脚本类型
    const osTypeMap = {
      'darwin': 'darwin',
      'windows': 'windows'
    }

    // 如果 osType 匹配，直接使用
    if (osTypeMap[osType]) {
      return osTypeMap[osType]
    }

    // 否则根据解析器类型映射
    const parserMap = {
      'ubuntu': 'ubuntu',
      'centos': 'centos',
      'linux': 'linux'
    }

    return parserMap[parserType] || 'linux'
  }



  /**
   * 升级框架
   * @param {string} serverId - 服务器ID
   * @param {Object} upgradeConfig - 升级配置
   */
  async upgradeFramework(serverId, upgradeConfig) {
    const { framework, envType, envName, gitUrl, branch } = upgradeConfig

    let upgradeCmd = ''
    if (gitUrl && branch) {
      // 从GitHub分支安装
      upgradeCmd = `pip install --upgrade git+${gitUrl}@${branch}`
    } else {
      // 从PyPI升级
      upgradeCmd = `pip install --upgrade ${framework}`
    }

    let fullCommand = ''
    if (envType === 'conda' && envName) {
      // 使用统一的 findCondaPath 方法查找 conda
      const condaPath = await this.findCondaPath(serverId)

      if (!condaPath) {
        throw new Error('未找到 conda 安装，请确保 conda 已正确安装')
      }

      const condaBin = condaPath.endsWith('conda') ? condaPath : `${condaPath}/conda`
      // 在指定的 conda 环境中执行升级命令
      fullCommand = `${condaBin} run -n ${envName} --no-capture-output ${upgradeCmd}`
    } else if (envType === 'uv' && envName) {
      // UV 环境使用虚拟环境的 pip
      fullCommand = `${envName}/bin/uv pip ${upgradeCmd.replace('pip install ', '')}`
    } else {
      fullCommand = upgradeCmd
    }

    const result = await this.execCommand(serverId, fullCommand)

    if (result.success) {
      return { success: true, message: '升级成功', output: result.stdout }
    } else {
      throw new Error(`升级失败: ${result.stderr}`)
    }
  }

  /**
   * 获取框架版本信息
   * @param {string} serverId - 服务器ID
   * @param {string} framework - 框架名称
   * @param {string} envType - 环境类型
   * @param {string} envName - 环境名称
   */
  async getFrameworkVersion(serverId, framework, envType, envName) {
    let command = ''

    if (envType === 'conda') {
      // 使用统一的 findCondaPath 方法查找 conda
      const condaPath = await this.findCondaPath(serverId)

      if (!condaPath) {
        return '未知'
      }

      const condaBin = condaPath.endsWith('conda') ? condaPath : `${condaPath}/conda`
      // 在指定的 conda 环境中执行命令
      command = `${condaBin} run -n ${envName} --no-capture-output pip show ${framework} | grep Version`
    } else if (envType === 'uv') {
      command = `${envName}/bin/pip show ${framework} | grep Version`
    } else {
      command = `pip show ${framework} | grep Version`
    }

    const result = await this.execCommand(serverId, command)

    if (result.success) {
      const match = result.stdout.match(/Version:\s*(.+)/)
      return match ? match[1].trim() : '未知'
    }
    return '未知'
  }

  /**
   * 获取适当的解析器
   */
  async getParserForServer(serverId) {
    // 检查缓存
    if (this.serverSystemCache.has(serverId)) {
      const cachedSystem = this.serverSystemCache.get(serverId);
      return this.parsers[cachedSystem] || this.parsers.linux;
    }
    
    // 检测系统类型
    const systemType = await this.systemDetector.detectSystemType(serverId);
    
    // 缓存结果
    this.serverSystemCache.set(serverId, systemType);
    
    // 返回相应的解析器
    return this.parsers[systemType] || this.parsers.linux;
  }

  /**
   * 检测下载命令是否存在（在指定的环境中检查）
   * @param {string} serverId - 服务器ID
   * @param {string} envType - 环境类型 (conda | uv | system)
   * @param {string} envName - 环境名称或路径
   * @param {string} command - 命令名称 (modelscope | huggingface-cli)
   */
  async checkDownloadCommand(serverId, envType, envName, command) {
    console.log(`[SSH Manager] 检测命令: envType=${envType}, envName=${envName}, command=${command}`)

    if (envType === 'conda' && envName) {
      // conda 环境：在该环境中检查命令是否存在
      return await this.checkCondaEnvironmentCommand(serverId, envName, command)
    } else if (envType === 'uv' && envName) {
      // uv 环境：在该环境中检查命令/模块是否存在
      return await this.checkUVEnvironmentCommand(serverId, envName, command)
    } else {
      // system 环境：直接在系统中查找
      return await this.checkSystemCommand(serverId, command)
    }
  }

  /**
   * 在指定的 conda 环境中检查命令是否存在
   * @param {string} serverId - 服务器ID
   * @param {string} envName - conda 环境名称
   * @param {string} command - 命令名称
   */
  async checkCondaEnvironmentCommand(serverId, envName, command) {
    // 先找到 conda 的路径
    const condaPath = await this.findCondaPath(serverId)

    if (!condaPath) {
      console.error(`[SSH Manager] 找不到 conda 命令`)
      return false
    }

    const condaBin = condaPath.endsWith('conda') ? condaPath : `${condaPath}/conda`
    console.log(`[SSH Manager] 使用 conda 路径: ${condaBin}`)

    // 方法1：在指定 conda 环境中使用 which 查找命令
    const whichCmd = `${condaBin} run -n ${envName} --no-capture-output which ${command}`
    console.log(`[SSH Manager] 执行命令: ${whichCmd}`)
    const whichResult = await this.execCommand(serverId, whichCmd)

    if (whichResult.success && whichResult.stdout && whichResult.stdout.trim() && !whichResult.stdout.includes('not found')) {
      console.log(`[SSH Manager] 在 conda 环境 ${envName} 中找到 ${command}: ${whichResult.stdout.trim()}`)
      return true
    }

    // 方法2：在指定 conda 环境中执行命令的 --version 参数
    const versionCmd = `${condaBin} run -n ${envName} --no-capture-output ${command} --version 2>&1 | head -1`
    console.log(`[SSH Manager] 执行命令: ${versionCmd}`)
    const versionResult = await this.execCommand(serverId, versionCmd)

    if (versionResult.success || (versionResult.stderr && versionResult.stderr.includes('version'))) {
      const output = versionResult.stdout || versionResult.stderr
      if (output && !output.toLowerCase().includes('command not found') && !output.toLowerCase().includes('not found')) {
        console.log(`[SSH Manager] ${command} --version 执行成功`)
        return true
      }
    }

    // 方法3：直接在环境的 bin 目录中查找
    const envPathCmd = `ls $(dirname ${condaBin})/envs/${envName}/bin/${command} 2>/dev/null`
    console.log(`[SSH Manager] 执行命令: ${envPathCmd}`)
    const pathResult = await this.execCommand(serverId, envPathCmd)

    if (pathResult.success && pathResult.stdout && pathResult.stdout.trim()) {
      console.log(`[SSH Manager] 在环境 bin 目录中找到 ${command}`)
      return true
    }

    console.log(`[SSH Manager] 在 conda 环境 ${envName} 中未找到 ${command}`)
    return false
  }

  /**
   * 在指定的 uv 环境中检查命令/模块是否存在
   * @param {string} serverId - 服务器ID
   * @param {string} envPath - uv 环境路径
   * @param {string} command - 命令名称
   */
  async checkUVEnvironmentCommand(serverId, envPath, command) {
    console.log(`[SSH Manager] 检查 uv 环境: ${envPath}`)

    // 方法1：直接在 uv 环境的 bin 目录中查找命令
    const binCheckCmd = `ls ${envPath}/bin/${command} 2>/dev/null`
    console.log(`[SSH Manager] 执行命令: ${binCheckCmd}`)
    const binResult = await this.execCommand(serverId, binCheckCmd)

    if (binResult.success && binResult.stdout && binResult.stdout.trim()) {
      console.log(`[SSH Manager] 在 uv 环境 bin 目录中找到 ${command}`)
      return true
    }

    // 方法2：使用 Python 检查模块是否已安装（modelscope 或 huggingface_hub）
    const moduleName = command === 'modelscope' ? 'modelscope' : 'huggingface_hub'
    const moduleCheckCmd = `${envPath}/bin/python -c "import ${moduleName}; print('${moduleName} 已安装')"`
    console.log(`[SSH Manager] 执行命令: ${moduleCheckCmd}`)
    const moduleResult = await this.execCommand(serverId, moduleCheckCmd)

    if (moduleResult.success && moduleResult.stdout && !moduleResult.stderr.includes('ModuleNotFoundError')) {
      console.log(`[SSH Manager] ${moduleName} 模块已安装`)
      return true
    }

    // 方法3：使用 shutil.which 在 Python 中查找命令
    const whichCheckCmd = `${envPath}/bin/python -c "import shutil; print(shutil.which('${command}') or '')"`
    console.log(`[SSH Manager] 执行命令: ${whichCheckCmd}`)
    const whichResult = await this.execCommand(serverId, whichCheckCmd)

    if (whichResult.success && whichResult.stdout && whichResult.stdout.trim()) {
      console.log(`[SSH Manager] 通过 shutil.which 找到 ${command}`)
      return true
    }

    console.log(`[SSH Manager] 在 uv 环境 ${envPath} 中未找到 ${command}`)
    return false
  }

  /**
   * 在系统中检查命令是否存在
   * @param {string} serverId - 服务器ID
   * @param {string} command - 命令名称
   */
  async checkSystemCommand(serverId, command) {
    console.log(`[SSH Manager] 检查系统命令: ${command}`)

    // 方法1：使用 which 查找
    const whichCmd = `which ${command}`
    console.log(`[SSH Manager] 执行命令: ${whichCmd}`)
    const whichResult = await this.execCommand(serverId, whichCmd)

    if (whichResult.success && whichResult.stdout && whichResult.stdout.trim() && !whichResult.stdout.includes('not found')) {
      console.log(`[SSH Manager] 在系统中找到 ${command}: ${whichResult.stdout.trim()}`)
      return true
    }

    // 方法2：执行命令的 --version 参数
    const versionCmd = `${command} --version 2>&1 | head -1`
    console.log(`[SSH Manager] 执行命令: ${versionCmd}`)
    const versionResult = await this.execCommand(serverId, versionCmd)

    if (versionResult.success || (versionResult.stderr && versionResult.stderr.includes('version'))) {
      const output = versionResult.stdout || versionResult.stderr
      if (output && !output.toLowerCase().includes('command not found')) {
        console.log(`[SSH Manager] ${command} --version 执行成功`)
        return true
      }
    }

    console.log(`[SSH Manager] 在系统中未找到 ${command}`)
    return false
  }

  /**
   * 下载模型
   * @param {Object} config - 下载配置
   */
  async downloadModel(config) {
    const { serverId, envType, envName, platform, modelId, installPath, downloadId, mainWindow } = config

    console.log('[downloadModel] 开始下载，downloadId:', downloadId)
    console.log('[downloadModel] mainWindow:', mainWindow ? '存在' : '不存在')

    // 创建安装目录
    const mkdirResult = await this.execCommand(serverId, `mkdir -p "${installPath}"`)
    if (!mkdirResult.success) {
      throw new Error('创建安装目录失败')
    }

    // 发送日志到前端的辅助函数
    const sendLog = (log) => {
      console.log('[下载日志]', log)
      if (mainWindow && mainWindow.webContents) {
        console.log(`[下载日志] 发送事件: download:log:${downloadId}`)
        mainWindow.webContents.send(`download:log:${downloadId}`, { log })
      } else {
        console.warn('[下载日志] mainWindow 或 webContents 不存在，无法发送日志')
      }
    }

    // 根据环境类型构建下载命令
    let fullCommand = ''
    if (envType === 'conda' && envName) {
      // conda 环境：在指定的 conda 环境中执行下载命令
      const condaPath = await this.findCondaPath(serverId)

      if (!condaPath) {
        throw new Error('找不到 conda 命令，请确保 conda 已安装')
      }

      const condaBin = condaPath.endsWith('conda') ? condaPath : `${condaPath}/conda`

      // 构建下载命令
      let downloadCmd = ''
      if (platform === 'modelscope') {
        downloadCmd = `modelscope download --model ${modelId} --local_dir "${installPath}"`
      } else if (platform === 'huggingface') {
        downloadCmd = `huggingface-cli download ${modelId} --local-dir "${installPath}" --local-dir-use-symlinks False`
      }

      // 在指定的 conda 环境中执行
      fullCommand = `${condaBin} run -n ${envName} --no-capture-output ${downloadCmd}`
      sendLog(`[下载] 在 conda 环境 "${envName}" 中执行下载`)
    } else if (envType === 'uv' && envName) {
      // uv 环境：使用 uv 环境的 Python 执行下载
      if (platform === 'modelscope') {
        fullCommand = `${envName}/bin/python -m modelscope download --model ${modelId} --local_dir "${installPath}"`
      } else if (platform === 'huggingface') {
        fullCommand = `${envName}/bin/python -m huggingface_hub.cli download ${modelId} --local-dir "${installPath}" --local-dir-use-symlinks False`
      }
      sendLog(`[下载] 在 uv 环境 "${envName}" 中执行下载`)
    } else {
      // system 环境：直接执行命令
      if (platform === 'modelscope') {
        fullCommand = `modelscope download --model ${modelId} --local_dir "${installPath}"`
      } else if (platform === 'huggingface') {
        fullCommand = `huggingface-cli download ${modelId} --local-dir "${installPath}" --local-dir-use-symlinks False`
      }
      sendLog(`[下载] 在系统环境中执行下载`)
    }

    console.log('[下载] 执行命令:', fullCommand)

    // 获取连接
    const conn = this.connections.get(serverId)
    if (!conn) {
      throw new Error('服务器未连接')
    }

    // 直接使用 SSH stream 执行命令
    return new Promise((resolve, reject) => {
      conn.exec(fullCommand, (err, stream) => {
        if (err) {
          console.error('[下载] SSH exec 错误:', err)
          sendLog(`[错误] SSH 执行失败: ${err.message}`)
          reject(err)
          return
        }

        console.log('[下载] Stream 已创建')
        sendLog('[下载] 命令已发送，开始下载...')

        let currentProgress = 0
        let dataCount = 0
        let stderrCount = 0

        // 处理 stdout
        stream.on('data', (data) => {
          dataCount++
          console.log('[下载] 收到 stdout 数据 #', dataCount, '长度:', data.length)
          const lines = data.toString().split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed) {
              sendLog(trimmed)

              // 解析并发送进度
              const parsedProgress = this.parseDownloadProgress(platform, trimmed)
              if (parsedProgress !== null && parsedProgress !== currentProgress) {
                currentProgress = parsedProgress
                if (mainWindow && mainWindow.webContents) {
                  mainWindow.webContents.send(`download:progress:${downloadId}`, {
                    percentage: currentProgress
                  })
                }
              }
            }
          }
        })

        // 处理 stderr - 下载工具通常将进度输出到 stderr
        stream.stderr.on('data', (data) => {
          stderrCount++
          console.log('[下载] 收到 stderr 数据 #', stderrCount, '长度:', data.length)
          const lines = data.toString().split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed) {
              sendLog(trimmed)

              // 解析并发送进度
              const parsedProgress = this.parseDownloadProgress(platform, trimmed)
              if (parsedProgress !== null && parsedProgress !== currentProgress) {
                currentProgress = parsedProgress
                if (mainWindow && mainWindow.webContents) {
                  mainWindow.webContents.send(`download:progress:${downloadId}`, {
                    percentage: currentProgress
                  })
                }
              }
            }
          }
        })

        stream.on('close', async (code) => {
          console.log('[下载] Stream 关闭，退出码:', code, 'stdout 次数:', dataCount, 'stderr 次数:', stderrCount)
          sendLog(`[下载] 进程退出，退出码: ${code}`)

          if (code === 0) {
            // 整理文件
            await this.organizeDownloadedFiles(serverId, modelId, installPath, sendLog)
            sendLog('[下载] 全部完成！')

            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send(`download:progress:${downloadId}`, {
                percentage: 100,
                status: 'completed'
              })
            }

            resolve({ success: true })
          } else {
            sendLog(`[下载] 下载失败，退出码: ${code}`)
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send(`download:progress:${downloadId}`, {
                percentage: currentProgress,
                status: 'error'
              })
            }
            reject(new Error(`下载失败,退出码: ${code}`))
          }
        })

        stream.on('error', (err) => {
          console.error('[下载] Stream 错误:', err)
          sendLog(`[错误] ${err.message}`)
          reject(err)
        })
      })
    })
  }

  /**
   * 整理下载的文件
   */
  async organizeDownloadedFiles(serverId, modelId, installPath, sendLog) {
    try {
      const modelSubDir = `${installPath}/${modelId}`
      sendLog(`[下载] 检查模型子目录: ${modelSubDir}`)

      const checkResult = await this.execCommand(serverId, `test -d "${modelSubDir}" && echo "exists" || echo "not exists"`)
      const subDirExists = checkResult.stdout?.trim() === 'exists'

      if (subDirExists) {
        sendLog(`[下载] 发现模型子目录，移动内容`)

        await this.execCommand(serverId, `mv "${modelSubDir}"/* "${installPath}/" 2>&1 || true`)
        sendLog(`[下载] 移动文件完成`)

        await this.execCommand(serverId, `rm -rf "${modelSubDir}"`)
        sendLog(`[下载] 已删除临时子目录`)
      }
    } catch (error) {
      sendLog(`[下载] 整理文件失败: ${error.message}`)
    }
  }

  /**
   * 解析下载进度
   * @param {string} platform - 平台
   * @param {string} output - 命令输出
   */
  parseDownloadProgress(platform, output) {
    // ModelScope 进度解析
    if (platform === 'modelscope') {
      // 匹配格式: "Downloading: 45% (450MB/1000MB)" 或 "45%"
      const match = output.match(/(\d+)%/)
      if (match) {
        return parseInt(match[1], 10)
      }
    }

    // HuggingFace 进度解析
    if (platform === 'huggingface') {
      // 匹配格式: "Downloading (…)45%|████████     | 450MB/1000MB" 或 "45%"
      const match = output.match(/(\d+)%/)
      if (match) {
        return parseInt(match[1], 10)
      }
    }

    return null
  }

  /**
   * 取消下载
   * @param {string} serverId - 服务器ID
   * @param {string} modelId - 模型ID
   */
  async cancelDownload(serverId, modelId) {
    try {
      // 使用进程关键词查找并终止
      const searchKeyword = modelId.split('/').pop()
      await this.execCommand(serverId, `pkill -f "${searchKeyword}"`)
      await this.execCommand(serverId, `pkill -f "modelscope download"`)
      await this.execCommand(serverId, `pkill -f "huggingface-cli download"`)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取当前_conda数据源配置
   * @param {string} serverId - 服务器ID
   * @param {string} envType - 环境类型 (conda/uv/system)
   * @param {string} envName - 环境名称
   */
  async getCondaDataSource(serverId, envType = 'conda', envName = 'base') {
    try {
      const server = this.getServerById(serverId)
      if (!server) {
        return { success: false, error: '服务器不存在' }
      }

      let condarcPath = '~/.condarc'

      // 如果是 localhost，使用本地的用户目录
      if (server.type === 'localhost') {
        condarcPath = `${process.env.HOME}/.condarc`
      }

      // 读取 .condarc 文件
      const result = await this.execCommand(serverId, `cat ${condarcPath} 2>/dev/null || echo ""`)

      if (!result.success) {
        return { success: false, error: result.stderr || '读取配置文件失败' }
      }

      const configContent = result.stdout.trim()
      const channels = []
      let customConfig = null

      if (configContent) {
        // 解析 conda 配置
        const lines = configContent.split('\n')
        let inChannels = false

        for (const line of lines) {
          const trimmed = line.trim()

          if (trimmed.startsWith('channels:')) {
            inChannels = true
            continue
          }

          if (inChannels) {
            if (trimmed.startsWith('-') && trimmed.includes('http')) {
              const url = trimmed.replace(/^\s*-\s*/, '').trim()
              channels.push(url)
            } else if (trimmed && !trimmed.startsWith('-')) {
              inChannels = false
            }
          }
        }

        customConfig = configContent
      }

      // 获取默认源
      const defaultChannels = [
        'https://repo.anaconda.com/pkgs/main',
        'https://repo.anaconda.com/pkgs/r',
        'https://repo.anaconda.com/pkgs/msys2'
      ]

      return {
        success: true,
        data: {
          channels,
          defaultChannels,
          customConfig,
          hasCustomConfig: !!configContent,
          isDefault: channels.length === 0
        }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 设置 conda 数据源
   * @param {string} serverId - 服务器ID
   * @param {Array} channels - 数据源列表
   */
  async setCondaDataSource(serverId, channels = []) {
    try {
      const server = this.getServerById(serverId)
      if (!server) {
        return { success: false, error: '服务器不存在' }
      }

      let condarcPath = '~/.condarc'

      if (server.type === 'localhost') {
        condarcPath = `${process.env.HOME}/.condarc`
      }

      // 构建配置内容
      let configContent = 'ssl_verify: true\n'

      if (channels && channels.length > 0) {
        configContent += 'channels:\n'
        for (const channel of channels) {
          configContent += `  - ${channel}\n`
        }
        configContent += '  - defaults\n'
      } else {
        // 如果没有指定源，使用默认
        configContent += 'channels:\n  - defaults\n'
      }

      // 备份原配置
      await this.execCommand(serverId, `cp ${condarcPath} ${condarcPath}.bak 2>/dev/null || true`)

      // 写入新配置
      const writeResult = await this.execCommand(
        serverId,
        `cat > ${condarcPath} << 'EOF'\n${configContent}EOF`
      )

      if (!writeResult.success) {
        return { success: false, error: writeResult.stderr || '写入配置文件失败' }
      }

      return { success: true, message: 'Conda 数据源已更新' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取 pip 数据源配置
   * @param {string} serverId - 服务器ID
   * @param {string} envType - 环境类型 (conda/uv/system)
   * @param {string} envName - 环境名称
   */
  async getPipDataSource(serverId, envType = 'conda', envName = 'base') {
    try {
      const server = this.getServerById(serverId)
      if (!server) {
        return { success: false, error: '服务器不存在' }
      }

      let pipConfigPath = '~/.pip/pip.conf'

      // 根据操作系统确定配置文件路径
      if (server.type === 'localhost') {
        const osType = server.osType || process.platform
        if (osType === 'darwin') {
          pipConfigPath = '~/Library/Application Support/pip/pip.conf'
        } else if (osType === 'windows') {
          pipConfigPath = '$env:APPDATA\\pip\\pip.ini'
        }
      }

      // 读取 pip 配置
      const result = await this.execCommand(serverId, `cat ${pipConfigPath} 2>/dev/null || echo ""`)

      if (!result.success) {
        return { success: false, error: result.stderr || '读取配置文件失败' }
      }

      const configContent = result.stdout.trim()
      let indexUrl = null
      let trustedHosts = []
      let extraIndexUrls = []

      if (configContent) {
        // 解析 pip 配置
        const lines = configContent.split('\n')
        let inGlobal = false

        for (const line of lines) {
          const trimmed = line.trim()

          if (trimmed === '[global]') {
            inGlobal = true
            continue
          }

          if (trimmed.startsWith('[') && trimmed !== '[global]') {
            inGlobal = false
          }

          if (inGlobal) {
            const match = trimmed.match(/^index-url\s*=\s*(.+)$/)
            if (match) {
              indexUrl = match[1].trim()
            }

            const extraMatch = trimmed.match(/^extra-index-url\s*=\s*(.+)$/)
            if (extraMatch) {
              extraIndexUrls.push(extraMatch[1].trim())
            }

            const trustedMatch = trimmed.match(/^trusted-host\s*=\s*(.+)$/)
            if (trustedMatch) {
              trustedHosts.push(trustedMatch[1].trim())
            }
          }
        }
      }

      const defaultIndexUrl = 'https://pypi.org/simple'

      return {
        success: true,
        data: {
          indexUrl: indexUrl || defaultIndexUrl,
          extraIndexUrls,
          trustedHosts,
          customConfig: configContent,
          hasCustomConfig: !!configContent,
          isDefault: !indexUrl || indexUrl === defaultIndexUrl
        }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 设置 pip 数据源
   * @param {string} serverId - 服务器ID
   * @param {string} indexUrl - 主索引URL
   * @param {Array} extraIndexUrls - 额外索引URL列表
   */
  async setPipDataSource(serverId, indexUrl, extraIndexUrls = []) {
    try {
      const server = this.getServerById(serverId)
      if (!server) {
        return { success: false, error: '服务器不存在' }
      }

      let pipConfigDir = '~/.pip'
      let pipConfigPath = '~/.pip/pip.conf'

      // 根据操作系统确定配置文件路径
      if (server.type === 'localhost') {
        const osType = server.osType || process.platform
        if (osType === 'darwin') {
          pipConfigDir = '~/Library/Application Support/pip'
          pipConfigPath = '~/Library/Application Support/pip/pip.conf'
        } else if (osType === 'windows') {
          pipConfigDir = '$env:APPDATA\\pip'
          pipConfigPath = '$env:APPDATA\\pip\\pip.ini'
        }
      }

      // 创建配置目录
      await this.execCommand(serverId, `mkdir -p ${pipConfigDir} 2>/dev/null || true`)

      // 构建配置内容
      let configContent = '[global]\n'
      configContent += `index-url = ${indexUrl}\n`

      // 提取可信主机
      const url = new URL(indexUrl)
      configContent += `trusted-host = ${url.hostname}\n`

      if (extraIndexUrls && extraIndexUrls.length > 0) {
        for (const extraUrl of extraIndexUrls) {
          configContent += `extra-index-url = ${extraUrl}\n`
          const extraUrlObj = new URL(extraUrl)
          if (!trustedHosts.includes(extraUrlObj.hostname)) {
            configContent += `trusted-host = ${extraUrlObj.hostname}\n`
          }
        }
      }

      // 备份原配置
      await this.execCommand(serverId, `cp ${pipConfigPath} ${pipConfigPath}.bak 2>/dev/null || true`)

      // 写入新配置
      const writeResult = await this.execCommand(
        serverId,
        `cat > ${pipConfigPath} << 'EOF'\n${configContent}EOF`
      )

      if (!writeResult.success) {
        return { success: false, error: writeResult.stderr || '写入配置文件失败' }
      }

      return { success: true, message: 'Pip 数据源已更新' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 恢复默认数据源
   * @param {string} serverId - 服务器ID
   * @param {string} sourceType - 数据源类型 (conda/pip)
   */
  async restoreDefaultDataSource(serverId, sourceType) {
    try {
      const server = this.getServerById(serverId)
      if (!server) {
        return { success: false, error: '服务器不存在' }
      }

      if (sourceType === 'conda') {
        let condarcPath = '~/.condarc'

        if (server.type === 'localhost') {
          condarcPath = `${process.env.HOME}/.condarc`
        }

        // 删除配置文件以使用默认源
        const result = await this.execCommand(serverId, `rm -f ${condarcPath}`)

        if (!result.success) {
          return { success: false, error: result.stderr || '删除配置文件失败' }
        }

        return { success: true, message: 'Conda 数据源已恢复为默认' }
      } else if (sourceType === 'pip') {
        let pipConfigPath = '~/.pip/pip.conf'

        if (server.type === 'localhost') {
          const osType = server.osType || process.platform
          if (osType === 'darwin') {
            pipConfigPath = '~/Library/Application Support/pip/pip.conf'
          } else if (osType === 'windows') {
            pipConfigPath = '$env:APPDATA\\pip\\pip.ini'
          }
        }

        // 删除配置文件以使用默认源
        const result = await this.execCommand(serverId, `rm -f ${pipConfigPath}`)

        if (!result.success) {
          return { success: false, error: result.stderr || '删除配置文件失败' }
        }

        return { success: true, message: 'Pip 数据源已恢复为默认' }
      }

      return { success: false, error: '不支持的数据源类型' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 测试数据源速度（可选功能）
   * @param {string} serverId - 服务器ID
   * @param {string} url - 测试URL
   */
  async testDataSourceSpeed(serverId, url) {
    try {
      const server = this.getServerById(serverId)
      if (!server) {
        return { success: false, error: '服务器不存在' }
      }

      const startTime = Date.now()

      // 使用 curl 测试连接速度
      const result = await this.execCommand(
        serverId,
        `curl -I -s -m 5 --connect-timeout 3 "${url}" 2>&1 | head -n 1 || echo "failed"`
      )

      const endTime = Date.now()
      const duration = endTime - startTime

      if (result.stdout.includes('HTTP') && result.stdout.includes('200')) {
        return {
          success: true,
          data: {
            url,
            accessible: true,
            duration,
            status: 'OK'
          }
        }
      } else {
        return {
          success: true,
          data: {
            url,
            accessible: false,
            duration,
            status: 'Failed'
          }
        }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 断开所有连接
   */
  disconnectAll() {
    for (const [serverId, conn] of this.connections.entries()) {
      conn.end()
    }
    this.connections.clear()
    // 清理系统类型缓存
    this.serverSystemCache.clear()
    // 清理 GPU 厂商缓存
    this.gpuManager.clearAllCache()
  }

  // ==================== 文件管理 ====================

  /**
   * 列出目录内容
   * @param {string} serverId - 服务器ID
   * @param {string} path - 目录路径
   */
  async listDirectory(serverId, path) {
    try {
      const lsResult = await this.execCommand(serverId, `ls -la "${path}" 2>&1`)
      if (!lsResult.success) {
        return { success: false, error: lsResult.stderr || '无法访问目录' }
      }

      const files = []
      const lines = lsResult.stdout.split('\n')

      for (const line of lines) {
        // 跳过空行和总计行
        if (!line.trim() || line.startsWith('total')) {
          continue
        }

        // 解析 ls -la 输出
        // 格式: -rw-r--r-- 1 user group size month day time filename
        const parts = line.trim().split(/\s+/)
        if (parts.length < 8) {
          continue
        }

        const permissions = parts[0]
        const isDirectory = permissions.startsWith('d')
        const size = parseInt(parts[4], 10) || 0
        const month = parts[5]
        const day = parts[6]
        const time = parts[7]
        const name = parts.slice(8).join(' ')

        // 跳过 . 和 ..
        if (name === '.' || name === '..') {
          continue
        }

        // 构建完整路径
        const fullPath = path === '/' ? `/${name}` : `${path}/${name}`.replace(/\/+/g, '/')

        files.push({
          name,
          path: fullPath,
          isDirectory,
          size: isDirectory ? 0 : size,
          permissions,
          modifiedTime: `${month} ${day} ${time}`
        })
      }

      return { success: true, data: files }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 创建目录
   * @param {string} serverId - 服务器ID
   * @param {string} parentPath - 父目录路径
   * @param {string} name - 目录名称
   */
  async createDirectory(serverId, parentPath, name) {
    try {
      const fullPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`.replace(/\/+/g, '/')
      const result = await this.execCommand(serverId, `mkdir -p "${fullPath}"`)
      if (result.success) {
        return { success: true, data: { path: fullPath } }
      }
      return { success: false, error: result.stderr || '创建目录失败' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 创建文件
   * @param {string} serverId - 服务器ID
   * @param {string} parentPath - 父目录路径
   * @param {string} name - 文件名称
   */
  async createFile(serverId, parentPath, name) {
    try {
      const fullPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`.replace(/\/+/g, '/')
      const result = await this.execCommand(serverId, `touch "${fullPath}"`)
      if (result.success) {
        return { success: true, data: { path: fullPath } }
      }
      return { success: false, error: result.stderr || '创建文件失败' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 重命名文件或目录
   * @param {string} serverId - 服务器ID
   * @param {string} oldPath - 旧路径
   * @param {string} newName - 新名称
   */
  async rename(serverId, oldPath, newName) {
    try {
      // 提取父目录路径
      const pathParts = oldPath.split('/')
      pathParts[pathParts.length - 1] = newName
      const newPath = pathParts.join('/')

      const result = await this.execCommand(serverId, `mv "${oldPath}" "${newPath}"`)
      if (result.success) {
        return { success: true, data: { path: newPath } }
      }
      return { success: false, error: result.stderr || '重命名失败' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 删除文件或目录（支持批量）
   * @param {string} serverId - 服务器ID
   * @param {string[]} paths - 路径数组
   */
  async delete(serverId, paths) {
    try {
      const results = []
      const errors = []

      for (const path of paths) {
        const result = await this.execCommand(serverId, `rm -rf "${path}"`)
        if (result.success) {
          results.push(path)
        } else {
          errors.push({ path, error: result.stderr || '删除失败' })
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          error: `部分文件删除失败: ${errors.map(e => e.path).join(', ')}`,
          data: { success: results, failed: errors }
        }
      }

      return { success: true, data: { deleted: results } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // ==================== GPU 进程管理 ====================

  /**
   * 检测服务器显卡类型并获取 GPU 进程列表
   * @param {string} serverId - 服务器ID
   * @returns {Promise<{success: boolean, gpuType: string, processes: array, error: string}>}
   */
  async getGPUProcesses(serverId) {
    try {
      const server = this.getServerById(serverId)
      if (!server) {
        return { success: false, error: '服务器不存在' }
      }

      // 检测显卡类型并获取进程
      const gpuDetection = [
        { type: 'nvidia', command: 'command -v nvidia-smi' },
        { type: 'amd', command: 'command -v rocm-smi' },
        { type: 'intel', command: 'command -v intel_gpu_top' }
      ]

      let detectedType = null

      // 检测显卡类型
      for (const gpu of gpuDetection) {
        const checkResult = await this.execCommand(serverId, gpu.command)
        if (checkResult.success && checkResult.stdout.trim()) {
          detectedType = gpu.type
          break
        }
      }

      if (!detectedType) {
        return {
          success: true,
          gpuType: null,
          processes: [],
          error: '未检测到支持的显卡类型（需要 nvidia-smi、rocm-smi 或 intel_gpu_top）'
        }
      }

      // 根据显卡类型获取进程
      let processes = []

      if (detectedType === 'nvidia') {
        processes = await this._getNvidiaProcesses(serverId)
      } else if (detectedType === 'amd') {
        processes = await this._getAMDProcesses(serverId)
      } else if (detectedType === 'intel') {
        processes = await this._getIntelProcesses(serverId)
      }

      return {
        success: true,
        gpuType: detectedType,
        processes
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取 NVIDIA GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<array>}
   */
  async _getNvidiaProcesses(serverId) {
    const processes = []

    try {
      // 使用 nvidia-smi 查询进程
      const queryCmd = 'nvidia-smi --query-compute-apps=pid,used_memory --format=csv,noheader,nounits 2>/dev/null'
      const result = await this.execCommand(serverId, queryCmd)

      if (!result.success || !result.stdout.trim()) {
        return processes
      }

      const lines = result.stdout.trim().split('\n')

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        // 解析 CSV 格式: pid,memory_mb
        const parts = trimmedLine.split(',')
        if (parts.length >= 2) {
          const pid = parseInt(parts[0].trim(), 10)
          const memoryMB = parseInt(parts[1].trim(), 10)

          if (pid && !isNaN(memoryMB)) {
            // 获取进程命令
            const cmdResult = await this.execCommand(serverId, `ps -p ${pid} -o user,comm --no-headers 2>/dev/null || echo "unknown"`)
            const userCmd = cmdResult.success ? cmdResult.stdout.trim() : 'unknown'
            const cmdParts = userCmd.split(/\s+/)
            const user = cmdParts[0] || 'unknown'
            const command = cmdParts.slice(1).join(' ') || 'unknown'

            processes.push({
              pid,
              command,
              memoryUsed: memoryMB * 1024 * 1024, // 转换为字节
              memoryFormatted: this._formatMemory(memoryMB * 1024 * 1024),
              gpuId: 0,
              user
            })
          }
        }
      }
    } catch (error) {
      console.error('Error getting NVIDIA processes:', error)
    }

    return processes
  }

  /**
   * 获取 AMD GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<array>}
   */
  async _getAMDProcesses(serverId) {
    const processes = []

    try {
      // 使用 rocm-smi 查询进程
      const queryCmd = 'rocm-smi --showmemuse --showpid 2>/dev/null'
      const result = await this.execCommand(serverId, queryCmd)

      if (!result.success || !result.stdout.trim()) {
        return processes
      }

      const lines = result.stdout.split('\n')
      let currentGPU = 0

      for (const line of lines) {
        const trimmedLine = line.trim()

        // 检测 GPU 编号
        const gpuMatch = trimmedLine.match(/GPU\s*\[(\d+)\]/)
        if (gpuMatch) {
          currentGPU = parseInt(gpuMatch[1], 10)
          continue
        }

        // 解析进程信息
        // 格式: PID: 12345 或类似
        const pidMatch = trimmedLine.match(/PID\s*:?\s*(\d+)/i)
        if (pidMatch) {
          const pid = parseInt(pidMatch[1], 10)

          // 尝试获取显存信息
          const memMatch = trimmedLine.match(/(\d+)\s*(MB|GB)/i)
          let memoryUsed = 0
          if (memMatch) {
            const value = parseFloat(memMatch[1])
            const unit = memMatch[2].toUpperCase()
            memoryUsed = unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024
          }

          // 获取进程命令
          const cmdResult = await this.execCommand(serverId, `ps -p ${pid} -o user,comm --no-headers 2>/dev/null || echo "unknown"`)
          const userCmd = cmdResult.success ? cmdResult.stdout.trim() : 'unknown'
          const cmdParts = userCmd.split(/\s+/)
          const user = cmdParts[0] || 'unknown'
          const command = cmdParts.slice(1).join(' ') || 'unknown'

          processes.push({
            pid,
            command,
            memoryUsed,
            memoryFormatted: memoryUsed > 0 ? this._formatMemory(memoryUsed) : 'N/A',
            gpuId: currentGPU,
            user
          })
        }
      }
    } catch (error) {
      console.error('Error getting AMD processes:', error)
    }

    return processes
  }

  /**
   * 获取 Intel GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<array>}
   */
  async _getIntelProcesses(serverId) {
    const processes = []

    try {
      // Intel GPU 的进程信息比较难获取，尝试使用 intel_gpu_top 的 JSON 输出
      const queryCmd = 'intel_gpu_top -J 2>/dev/null'
      const result = await this.execCommand(serverId, queryCmd)

      if (!result.success || !result.stdout.trim()) {
        // 如果 JSON 输出失败，返回空数组
        return processes
      }

      // 解析 JSON 输出
      try {
        const data = JSON.parse(result.stdout)
        // 解析 Intel JSON 格式的进程信息
        // 注意：具体格式取决于 intel_gpu_top 版本
        if (data && data.engines) {
          for (const [engineName, engineData] of Object.entries(data.engines)) {
            if (engineData && engineData.running_processes) {
              for (const proc of engineData.running_processes) {
                // 获取进程命令
                const cmdResult = await this.execCommand(serverId, `ps -p ${proc.pid} -o user,comm --no-headers 2>/dev/null || echo "unknown"`)
                const userCmd = cmdResult.success ? cmdResult.stdout.trim() : 'unknown'
                const cmdParts = userCmd.split(/\s+/)
                const user = cmdParts[0] || 'unknown'
                const command = cmdParts.slice(1).join(' ') || 'unknown'

                processes.push({
                  pid: proc.pid,
                  command,
                  memoryUsed: proc.memory_bytes || 0,
                  memoryFormatted: proc.memory_bytes ? this._formatMemory(proc.memory_bytes) : 'N/A',
                  gpuId: 0,
                  user
                })
              }
            }
          }
        }
      } catch (parseError) {
        console.error('Error parsing Intel GPU JSON:', parseError)
      }
    } catch (error) {
      console.error('Error getting Intel processes:', error)
    }

    return processes
  }

  /**
   * 格式化显存大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的字符串
   */
  _formatMemory(bytes) {
    if (!bytes || bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  }

  /**
   * 终止单个 GPU 进程
   * @param {string} serverId - 服务器ID
   * @param {number} pid - 进程ID
   * @returns {Promise<{success: boolean, error: string}>}
   */
  async killGPUProcess(serverId, pid) {
    try {
      const server = this.getServerById(serverId)
      if (!server) {
        return { success: false, error: '服务器不存在' }
      }

      // 发送 SIGTERM 先尝试优雅终止
      const termResult = await this.execCommand(serverId, `kill -15 ${pid} 2>/dev/null`)

      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 500))

      // 检查进程是否还在
      const checkResult = await this.execCommand(serverId, `ps -p ${pid} -o pid= 2>/dev/null`)

      if (checkResult.success && checkResult.stdout.trim()) {
        // 如果进程还在，使用 SIGKILL 强制终止
        const killResult = await this.execCommand(serverId, `kill -9 ${pid} 2>/dev/null`)

        if (!killResult.success) {
          return { success: false, error: killResult.stderr || '终止进程失败' }
        }
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 批量终止 GPU 进程
   * @param {string} serverId - 服务器ID
   * @param {number[]} pids - 进程ID数组
   * @returns {Promise<{success: boolean, killed: array, failed: array, error: string}>}
   */
  async killGPUBatchProcesses(serverId, pids) {
    try {
      const server = this.getServerById(serverId)
      if (!server) {
        return { success: false, error: '服务器不存在' }
      }

      const killed = []
      const failed = []

      // 并发终止进程（限制并发数）
      const batchSize = 5

      for (let i = 0; i < pids.length; i += batchSize) {
        const batch = pids.slice(i, i + batchSize)

        const results = await Promise.allSettled(
          batch.map(async (pid) => {
            const result = await this.killGPUProcess(serverId, pid)
            return { pid, result }
          })
        )

        for (const r of results) {
          if (r.status === 'fulfilled') {
            if (r.value.result.success) {
              killed.push(r.value.pid)
            } else {
              failed.push({ pid: r.value.pid, error: r.value.result.error })
            }
          } else {
            failed.push({ pid: r.value?.pid, error: '执行失败' })
          }
        }
      }

      return {
        success: true,
        killed,
        failed: failed.map(f => `${f.pid}(${f.error || '未知错误'})`)
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

// 导出单例
export default new SSHManager()
