/**
 * 通用的命令解析基础类
 * 定义通用的命令执行和解析方法
 */
export default class BaseCommandParser {
  constructor(sshManager) {
    this.sshManager = sshManager;
  }

  /**
   * 执行命令的通用方法
   */
  async execCommand(serverId, command) {
    return await this.sshManager.execCommand(serverId, command);
  }

  /**
   * 将磁盘大小字符串转换为字节
   */
  convertToBytes(sizeStr) {
    const match = sizeStr.match(/([\d.]+)([KMGTPE]?)/i);
    if (!match) return 0;

    const [, value, unit] = match;
    const numValue = parseFloat(value);

    switch (unit.toUpperCase()) {
      case 'K': return numValue * 1024;
      case 'M': return numValue * 1024 * 1024;
      case 'G': return numValue * 1024 * 1024 * 1024;
      case 'T': return numValue * 1024 * 1024 * 1024 * 1024;
      case 'P': return numValue * 1024 * 1024 * 1024 * 1024 * 1024;
      default: return numValue; // bytes
    }
  }

  /**
   * 解析内存信息的通用方法
   */
  parseMemoryInfo(stdout) {
    if (!stdout) return null;

    const memTotalMatch = stdout.match(/MemTotal:\s*(\d+)\s*kB/);
    const memAvailableMatch = stdout.match(/MemAvailable:\s*(\d+)\s*kB/);
    const memFreeMatch = stdout.match(/MemFree:\s*(\d+)\s*kB/);
    const buffersMatch = stdout.match(/Buffers:\s*(\d+)\s*kB/);
    const cachedMatch = stdout.match(/Cached:\s*(\d+)\s*kB/);

    const memTotal = memTotalMatch ? parseInt(memTotalMatch[1]) * 1024 : 0;
    const memFree = memFreeMatch ? parseInt(memFreeMatch[1]) * 1024 : 0;
    const buffers = buffersMatch ? parseInt(buffersMatch[1]) * 1024 : 0;
    const cached = cachedMatch ? parseInt(cachedMatch[1]) * 1024 : 0;

    let memAvailable = 0;
    let memUsed = 0;

    if (memAvailableMatch) {
      // 使用 MemAvailable（推荐方式，内核 3.14+）
      memAvailable = parseInt(memAvailableMatch[1]) * 1024;
      memUsed = memTotal - memAvailable;
    } else {
      // 旧内核：使用 MemFree + Buffers + Cached 作为可用内存
      memAvailable = memFree + buffers + cached;
      memUsed = memTotal - memAvailable;
    }

    return {
      total: memTotal,
      used: memUsed,
      available: memAvailable,
      free: memFree,
      usagePercent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0
    };
  }

  /**
   * 解析CPU信息的通用方法
   */
  parseCPUInfo(stdout) {
    if (!stdout) return null;

    const lines = stdout.split('\n');
    const cpuInfo = {};

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      switch (key) {
        case 'Model name':
          cpuInfo.model = value;
          break;
        case 'CPU(s)':
          cpuInfo.cores = parseInt(value) || 0;
          break;
        case 'Thread(s) per core':
          cpuInfo.threadsPerCore = parseInt(value) || 1;
          break;
        case 'Core(s) per socket':
          cpuInfo.coresPerSocket = parseInt(value) || 1;
          break;
        case 'Socket(s)':
          cpuInfo.sockets = parseInt(value) || 1;
          break;
        case 'Architecture':
          cpuInfo.arch = value;
          break;
        case 'CPU MHz':
          cpuInfo.frequency = (parseFloat(value) / 1000).toFixed(2); // 转换为 GHz
          break;
        case 'CPU max MHz':
          cpuInfo.maxFrequency = (parseFloat(value) / 1000).toFixed(2);
          break;
        case 'CPU min MHz':
          cpuInfo.minFrequency = (parseFloat(value) / 1000).toFixed(2);
          break;
      }
    }

    // 计算总线程数
    if (cpuInfo.coresPerSocket && cpuInfo.sockets) {
      cpuInfo.threads = cpuInfo.coresPerSocket * cpuInfo.sockets * (cpuInfo.threadsPerCore || 1);
    } else {
      cpuInfo.threads = cpuInfo.cores || 0;
    }

    return {
      model: cpuInfo.model || 'Unknown CPU',
      cores: cpuInfo.cores || 0,
      threads: cpuInfo.threads || 0,
      arch: cpuInfo.arch || 'Unknown',
      frequency: cpuInfo.frequency || '-',
      maxFrequency: cpuInfo.maxFrequency,
      minFrequency: cpuInfo.minFrequency,
      usagePercent: 0,  // 默认值，需要从 top 命令获取
      temperature: null  // 需要从 sensors 命令获取
    };
  }

  /**
   * 解析磁盘信息的通用方法
   */
  parseDiskInfo(stdout) {
    if (!stdout) return [];

    const diskLines = stdout.split('\n').filter(line => line.trim());
    const disks = [];
    const allMountPoints = []; // 收集所有挂载点用于子挂载点判断

    // 检测是否有标题行（包含 Filesystem 字样）
    let startIndex = 0;
    if (diskLines.length > 0 && diskLines[0].includes('Filesystem')) {
      startIndex = 1;
    }

    // 第一次遍历：收集所有挂载点
    for (let i = startIndex; i < diskLines.length; i++) {
      const line = diskLines[i].trim();
      if (!line) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 6) {
        const mountPoint = parts.slice(5).join(' ');
        if (mountPoint) {
          allMountPoints.push(mountPoint);
        }
      }
    }

    // 第二次遍历：解析并过滤磁盘信息
    for (let i = startIndex; i < diskLines.length; i++) {
      const line = diskLines[i].trim();
      if (!line) continue;

      // 解析磁盘行，格式通常为: Filesystem Size Used Avail Use% Mounted on
      const parts = line.split(/\s+/);

      // df -h 输出至少需要 6 列
      if (parts.length >= 6) {
        const filesystem = parts[0];
        const size = parts[1];
        const used = parts[2];
        const available = parts[3];
        const usagePercent = parts[4];
        let mountPoint = parts.slice(5).join(' ');

        // 跳过系统临时挂载点和虚拟文件系统
        if (this.isSystemMountPoint(mountPoint)) {
          continue;
        }

        // 跳过子挂载点（如 Docker overlay 等深层挂载）
        if (this.isSubMountPoint(mountPoint, allMountPoints)) {
          continue;
        }

        // 转换为字节
        const sizeBytes = this.convertToBytes(size);
        const usedBytes = this.convertToBytes(used);
        const availableBytes = this.convertToBytes(available);

        // 安全解析百分比
        let percent = 0;
        if (usagePercent) {
          const percentStr = String(usagePercent).replace('%', '').trim();
          percent = parseInt(percentStr);
          if (isNaN(percent)) percent = 0;
          percent = Math.min(100, Math.max(0, percent));
        }

        // 验证数据有效性
        if (sizeBytes > 0 && mountPoint) {
          disks.push({
            path: mountPoint,
            filesystem,
            total: sizeBytes,
            used: usedBytes,
            available: availableBytes,
            usagePercent: percent
          });
        }
      }
    }

    // 按挂载点路径排序，根分区在最前
    disks.sort((a, b) => {
      if (a.path === '/') return -1;
      if (b.path === '/') return 1;
      return a.path.localeCompare(b.path);
    });
    return disks;
  }

  /**
   * 判断是否为系统挂载点或需要过滤的挂载点
   */
  isSystemMountPoint(mountPoint) {
    if (!mountPoint) return false;

    const systemMountPoints = [
      '/proc', '/sys', '/dev', '/run', '/tmp', '/var/run', '/var/lock',
      '/sys/fs/cgroup', '/dev/shm', '/dev/pts', '/proc/sys/fs/binfmt_misc',
      '/sys/kernel/debug', '/sys/fs/fuse/connections', '/boot/efi',
      '/sys/fs/selinux', '/dev/mqueue', '/dev/hugepages', '/sys/kernel/config',
      // Docker 相关挂载点
      '/var/lib/docker',
      // Snap 相关挂载点
      '/snap',
      // 其他特殊挂载点
      '/var/lib/lxcfs',
      '/var/snap',
      '/mnt/cgroups'
    ];

    return systemMountPoints.some(sysMount => mountPoint.startsWith(sysMount));
  }

  /**
   * 判断是否为子挂载点（应该被主挂载点包含的挂载）
   * 例如：/boot 是独立的，但 /var/lib/docker/overlay2/... 是 /var 的子挂载
   */
  isSubMountPoint(mountPoint, allMountPoints) {
    if (!mountPoint) return false;

    // 定义主要挂载点列表（这些是用户关心的主要分区）
    const primaryMountPoints = [
      '/',           // 根分区
      '/home',       // 用户目录
      '/boot',       // 启动分区
      '/var',        // 可变数据
      '/usr',        // 用户程序
      '/opt',        // 可选软件包
      '/data',       // 数据目录
      '/mnt',        // 挂载点
      '/media'       // 可移动媒体
    ];

    // 如果是主要挂载点之一，不过滤
    if (primaryMountPoints.includes(mountPoint)) {
      return false;
    }

    // 检查是否是某个主要挂载点的子目录
    for (const primary of primaryMountPoints) {
      if (primary === '/') {
        // 对于根分区，检查是否是其他主要挂载点
        continue;
      }
      if (mountPoint.startsWith(primary + '/')) {
        return true; // 是子挂载点，应该被过滤
      }
    }

    return false;
  }

  /**
   * 解析GPU信息的通用方法
   */
  parseGPUInfo(stdout) {
    if (!stdout || stdout.includes('nvidia-smi not found')) return [];

    const gpuLines = stdout.split('\n').filter(line => line.trim());
    const gpus = [];

    for (const line of gpuLines) {
      if (!line.trim()) continue;

      // 解析GPU信息，格式为: name, memory.total(MB), memory.used(MB), utilization.gpu(%), utilization.memory(%), temperature.gpu, power.draw, power.limit, fan.speed, index
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 9) {
        const [
          name,
          memoryTotal,
          memoryUsed,
          gpuUtil,
          memoryUtil,
          temperature,
          powerDraw,
          powerLimit,
          fanSpeed,
          id
        ] = parts;

        const memTotal = parseInt(memoryTotal);
        const memUsed = parseInt(memoryUsed);
        const rawMemUtil = parseInt(memoryUtil) || 0;

        // 如果 nvidia-smi 报告的显存使用率为 0 但实际有显存使用，则手动计算
        let calculatedMemUtilPercent = rawMemUtil;
        if (memTotal > 0 && rawMemUtil === 0 && memUsed > 0) {
          calculatedMemUtilPercent = Math.round((memUsed / memTotal) * 100);
        }

        gpus.push({
          id: parseInt(id) || 0,
          name: name.trim(),
          memoryTotal: memTotal * 1024 * 1024, // MB to bytes
          memoryUsed: memUsed * 1024 * 1024, // MB to bytes
          memoryUsagePercent: calculatedMemUtilPercent,
          gpuUtil: parseInt(gpuUtil) || 0,
          temperature: parseInt(temperature) || 0,
          powerDraw: parseFloat(powerDraw) || 0,
          powerLimit: parseFloat(powerLimit) || 0,
          fanSpeed: parseInt(fanSpeed) || 0
        });
      }
    }

    return gpus;
  }

  /**
   * 获取系统信息的通用命令
   */
  async getSystemInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'uname -a');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * 获取CPU信息的通用命令
   */
  async getCPUInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'lscpu');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * 获取CPU使用率的通用命令
   */
  async getCPUUsageInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'top -bn1 | grep "Cpu(s)"');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * 获取CPU温度的通用命令
   */
  async getCPUTemperatureInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'sensors -j');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * 解析CPU使用率
   */
  parseCPUUsageInfo(stdout) {
    if (!stdout) return 0;

    // 解析 top 命令输出: %Cpu(s):  5.2 us,  2.1 sy,  0.0 ni, 92.2 id,  0.3 wa,  0.0 hi,  0.2 si,  0.0 st
    const match = stdout.match(/(\d+\.?\d*)\s*us,/);
    if (match) {
      const userUsage = parseFloat(match[1]);
      return Math.round(userUsage);
    }

    // 备用解析方式: mpstat 输出
    const mpstatMatch = stdout.match(/all\s+([\d\.]+)/);
    if (mpstatMatch) {
      const totalUsage = 100 - parseFloat(mpstatMatch[1]);
      return Math.round(totalUsage);
    }

    return 0;
  }

  /**
   * 解析CPU温度
   */
  parseCPUTemperatureInfo(stdout) {
    if (!stdout) return null;

    try {
      const data = JSON.parse(stdout);

      // 遍历所有传感器，寻找 CPU 温度
      for (const adapter in data) {
        const adapterData = data[adapter];
        if (Array.isArray(adapterData)) {
          for (const sensor of adapterData) {
            // 查找包含 CPU/Core 的温度传感器
            if (sensor['Core 0'] || sensor['Package id 0'] || sensor['Tctl']) {
              const temp = sensor['Core 0'] || sensor['Package id 0'] || sensor['Tctl'];
              if (temp && temp['temp2_input'] !== undefined) {
                return Math.round(temp['temp2_input']);
              }
              if (temp && temp['temp1_input'] !== undefined) {
                return Math.round(temp['temp1_input']);
              }
            }
            // 检查其他可能的 CPU 温度字段
            for (const key in sensor) {
              if (key.toLowerCase().includes('cpu') || key.toLowerCase().includes('core')) {
                const temp = sensor[key];
                if (temp && typeof temp === 'object' && temp['temp2_input'] !== undefined) {
                  return Math.round(temp['temp2_input']);
                }
                if (temp && typeof temp === 'object' && temp['temp1_input'] !== undefined) {
                  return Math.round(temp['temp1_input']);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      // JSON 解析失败，尝试文本解析
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes('core 0') || line.toLowerCase().includes('package')) {
          const match = line.match(/(\d+)\.\d+°[CF]/);
          if (match) {
            return parseInt(match[1]);
          }
        }
      }
    }

    return null;
  }

  /**
   * 获取内存信息的通用命令
   */
  async getMemoryInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'cat /proc/meminfo');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * 获取磁盘信息的通用命令
   */
  async getDiskInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'df -h');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * 获取GPU信息的通用命令
   */
  async getGPUInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'nvidia-smi --query-gpu=name,memory.total,memory.used,memory utilization,utilization.gpu,temperature.gpu,power.draw,power.limit,fan.speed,index --format=csv,noheader,nounits');
    } catch (error) {
      return null;
    }
  }
}