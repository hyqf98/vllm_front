import BaseCommandParser from './base-command-parser.js';

/**
 * 通用 Linux 系统的命令解析类
 * 适用于标准 Linux 发行版
 */
export default class LinuxParser extends BaseCommandParser {
  constructor(sshManager) {
    super(sshManager);
  }

  /**
   * 通用 Linux 的内存信息获取命令
   */
  async getMemoryInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'cat /proc/meminfo');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * 通用 Linux 的磁盘信息获取命令
   */
  async getDiskInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'df -h');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * 通用 Linux 的CPU信息获取命令
   */
  async getCPUInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'lscpu');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * 通用 Linux 的系统信息获取命令
   */
  async getSystemInfo(serverId) {
    try {
      // 获取发行版信息
      const distroResult = await this.execCommand(serverId,
        'cat /etc/os-release 2>/dev/null || uname -a');
      return distroResult;
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * 通用 Linux 的GPU信息获取命令
   */
  async getGPUInfo(serverId) {
    try {
      const result = await this.execCommand(serverId, 'nvidia-smi --query-gpu=name,memory.total,memory.used,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,fan.speed,index --format=csv,noheader,nounits 2>/dev/null || echo "nvidia-smi not found"');
      return result;
    } catch (error) {
      return { success: true, stdout: 'nvidia-smi not found' };
    }
  }

  /**
   * 解析通用 Linux 系统信息
   */
  parseSystemInfo(stdout) {
    if (!stdout) return { name: 'Unknown', version: 'Unknown' };

    // 尝试解析 /etc/os-release 格式
    const idMatch = stdout.match(/ID="?([^"\n\r]+)/i);
    const versionMatch = stdout.match(/VERSION_ID="?([^"\n\r]+)/i);
    const nameMatch = stdout.match(/PRETTY_NAME="?([^"\n\r]+)/i);

    if (idMatch) {
      const id = idMatch[1];
      const version = versionMatch ? versionMatch[1].replace(/"/g, '') : 'Unknown';
      const name = nameMatch ? nameMatch[1].replace(/"/g, '') : id;

      return {
        name: name,
        version: version
      };
    }

    // 如果没有找到 /etc/os-release 信息，使用通用方法
    const parts = stdout.split(' ');
    return {
      name: parts[0] || 'Unknown',
      version: stdout || 'Unknown'
    };
  }

  /**
   * 通用 Linux 的网络信息获取命令
   */
  async getNetworkInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'ip addr show 2>/dev/null || ifconfig');
    } catch (error) {
      return { success: false, data: { stdout: '' } };
    }
  }

  /**
   * 通用 Linux 的进程信息获取命令
   */
  async getProcessInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'ps aux --sort=-%cpu | head -20');
    } catch (error) {
      return { success: false, data: { stdout: '' } };
    }
  }
}