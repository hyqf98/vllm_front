import BaseCommandParser from './base-command-parser.js';

/**
 * CentOS 专用的命令解析类
 * CentOS/RHEL 系统有特定的命令和输出格式
 */
export default class CentosParser extends BaseCommandParser {
  constructor(sshManager) {
    super(sshManager);
  }

  /**
   * CentOS 特定的内存信息获取命令
   */
  async getMemoryInfo(serverId) {
    try {
      // CentOS 系统同样使用 /proc/meminfo 获取内存信息
      return await this.execCommand(serverId, 'cat /proc/meminfo');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * CentOS 特定的磁盘信息获取命令
   */
  async getDiskInfo(serverId) {
    try {
      // CentOS 系统的 df 命令
      return await this.execCommand(serverId, 'df -h');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * CentOS 特定的CPU信息获取命令
   */
  async getCPUInfo(serverId) {
    try {
      // CentOS 系统的 lscpu 命令
      return await this.execCommand(serverId, 'lscpu');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * CentOS 特定的系统信息获取命令
   */
  async getSystemInfo(serverId) {
    try {
      // 获取 CentOS 版本信息
      const versionResult = await this.execCommand(serverId, 'cat /etc/centos-release 2>/dev/null || cat /etc/redhat-release 2>/dev/null || uname -a');
      return versionResult;
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * CentOS 特定的GPU信息获取命令
   */
  async getGPUInfo(serverId) {
    try {
      // 尝试使用标准的 nvidia-smi 命令
      const result = await this.execCommand(serverId, 'nvidia-smi --query-gpu=name,memory.total,memory.used,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,fan.speed,index --format=csv,noheader,nounits 2>/dev/null || echo "nvidia-smi not found"');
      return result;
    } catch (error) {
      return { success: true, stdout: 'nvidia-smi not found' };
    }
  }

  /**
   * 解析CentOS特定的系统信息
   */
  parseSystemInfo(stdout) {
    if (!stdout) return { name: 'Unknown', version: 'Unknown' };

    // 尝试解析 CentOS 版本信息
    const centosMatch = stdout.match(/CentOS.*/i);
    const redhatMatch = stdout.match(/Red Hat.*/i);
    const releaseMatch = stdout.match(/release\s+([\d.]+)/i);

    if (centosMatch) {
      return {
        name: centosMatch[0].trim(),
        version: releaseMatch ? releaseMatch[1].trim() : 'Unknown'
      };
    } else if (redhatMatch) {
      return {
        name: redhatMatch[0].trim(),
        version: releaseMatch ? releaseMatch[1].trim() : 'Unknown'
      };
    }

    // 如果没有找到 CentOS 特定信息，使用通用方法
    const parts = stdout.split(' ');
    return {
      name: parts[0] || 'Unknown',
      version: stdout || 'Unknown'
    };
  }

  /**
   * CentOS 特定的网络信息获取命令
   */
  async getNetworkInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'ip addr show 2>/dev/null || ifconfig');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * CentOS 特定的进程信息获取命令
   */
  async getProcessInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'ps aux --sort=-%cpu | head -20');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }

  /**
   * CentOS 特定的包管理信息获取命令
   */
  async getPackageInfo(serverId) {
    try {
      return await this.execCommand(serverId, 'yum list installed | head -20 2>/dev/null || rpm -qa | head -20');
    } catch (error) {
      return { success: false, stdout: '' };
    }
  }
}