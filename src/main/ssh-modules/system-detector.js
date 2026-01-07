/**
 * 系统检测模块
 * 用于检测远程服务器的操作系统类型
 */
export default class SystemDetector {
  constructor(sshManager) {
    this.sshManager = sshManager;
  }

  /**
   * 检测服务器的操作系统类型
   */
  async detectSystemType(serverId) {
    try {
      // 尝试多种方法来检测系统类型
      const osReleaseResult = await this.sshManager.execCommand(serverId, 'cat /etc/os-release 2>/dev/null');
      
      if (osReleaseResult.success && osReleaseResult.stdout) {
        const osInfo = osReleaseResult.stdout.toLowerCase();
        
        if (osInfo.includes('ubuntu')) {
          return 'ubuntu';
        } else if (osInfo.includes('centos') || osInfo.includes('red hat')) {
          return 'centos';
        } else if (osInfo.includes('debian') || osInfo.includes('suse') || osInfo.includes('fedora')) {
          return 'linux';
        }
      }
      
      // 如果 /etc/os-release 不可用，尝试其他方法
      const lsbReleaseResult = await this.sshManager.execCommand(serverId, 'lsb_release -i 2>/dev/null');
      if (lsbReleaseResult.success && lsbReleaseResult.stdout) {
        const lsbInfo = lsbReleaseResult.stdout.toLowerCase();
        
        if (lsbInfo.includes('ubuntu')) {
          return 'ubuntu';
        } else if (lsbInfo.includes('centos') || lsbInfo.includes('redhat')) {
          return 'centos';
        }
      }
      
      // 检查特定发行版的文件
      const centosReleaseResult = await this.sshManager.execCommand(serverId, 'cat /etc/centos-release 2>/dev/null || cat /etc/redhat-release 2>/dev/null');
      if (centosReleaseResult.success && centosReleaseResult.stdout && centosReleaseResult.stdout.toLowerCase().includes('centos')) {
        return 'centos';
      }
      
      const ubuntuReleaseResult = await this.sshManager.execCommand(serverId, 'cat /etc/issue 2>/dev/null');
      if (ubuntuReleaseResult.success && ubuntuReleaseResult.stdout && ubuntuReleaseResult.stdout.toLowerCase().includes('ubuntu')) {
        return 'ubuntu';
      }
      
      // 默认返回通用linux
      return 'linux';
    } catch (error) {
      // 如果检测失败，返回通用linux类型
      return 'linux';
    }
  }

  /**
   * 获取系统详细信息
   */
  async getSystemDetails(serverId) {
    try {
      const systemInfo = await this.sshManager.execCommand(serverId, 'uname -a');
      const kernelVersion = await this.sshManager.execCommand(serverId, 'uname -r');

      return {
        systemInfo: systemInfo.stdout || 'Unknown',
        kernelVersion: kernelVersion.stdout || 'Unknown'
      };
    } catch (error) {
      return {
        systemInfo: 'Unknown',
        kernelVersion: 'Unknown'
      };
    }
  }
}