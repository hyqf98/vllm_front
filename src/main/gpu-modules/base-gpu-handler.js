/**
 * GPU 处理器基类
 * 所有显卡厂商的处理器都需要继承此类并实现相应方法
 */
class BaseGPUHandler {
  constructor(sshManager) {
    this.sshManager = sshManager
  }

  /**
   * 获取 GPU 厂商名称
   * @returns {string} 厂商名称 (nvidia, amd, intel等)
   */
  getVendorName() {
    throw new Error('getVendorName must be implemented by subclass')
  }

  /**
   * 检测该厂商的 GPU 是否可用
   * @param {string} serverId - 服务器ID
   * @returns {Promise<boolean>} 是否可用
   */
  async isAvailable(serverId) {
    try {
      const result = await this.sshManager.execCommand(serverId, this.getCheckCommand())
      return result.success
    } catch (error) {
      return false
    }
  }

  /**
   * 获取检测命令
   * @returns {string} 检测命令
   */
  getCheckCommand() {
    throw new Error('getCheckCommand must be implemented by subclass')
  }

  /**
   * 获取所有 GPU 进程的 PID 列表
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array<number>>} PID 列表
   */
  async getGPUProcessPIDs(serverId) {
    throw new Error('getGPUProcessPIDs must be implemented by subclass')
  }

  /**
   * 获取 GPU 进程的详细信息
   * @param {string} serverId - 服务器ID
   * @param {number} pid - 进程PID
   * @returns {Promise<Object>} 进程信息 {pid, command, gpuMemory, etc.}
   */
  async getGPUProcessInfo(serverId, pid) {
    throw new Error('getGPUProcessInfo must be implemented by subclass')
  }

  /**
   * 获取所有 GPU 上的进程列表
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array<Object>>} 进程列表
   */
  async getAllGPUProcesses(serverId) {
    throw new Error('getAllGPUProcesses must be implemented by subclass')
  }

  /**
   * 检查进程是否占用 GPU
   * @param {string} serverId - 服务器ID
   * @param {number} pid - 进程PID
   * @returns {Promise<boolean>} 是否占用 GPU
   */
  async isProcessOnGPU(serverId, pid) {
    const processes = await this.getAllGPUProcesses(serverId)
    return processes.some(p => p.pid === parseInt(pid.toString()))
  }

  /**
   * 根据 PID 获取进程命令行
   * @param {string} serverId - 服务器ID
   * @param {number} pid - 进程PID
   * @returns {Promise<string>} 命令行
   */
  async getProcessCommandLine(serverId, pid) {
    try {
      // 优先从 /proc 读取
      const cmdResult = await this.sshManager.execCommand(
        serverId,
        `cat /proc/${pid}/cmdline 2>/dev/null | tr '\\0' ' '`
      )
      if (cmdResult.success && cmdResult.stdout) {
        return cmdResult.stdout.trim()
      }

      // 降级使用 ps 命令
      const psResult = await this.sshManager.execCommand(
        serverId,
        `ps -p ${pid} -o args --no-headers`
      )
      if (psResult.success && psResult.stdout) {
        return psResult.stdout.trim()
      }

      return ''
    } catch (error) {
      return ''
    }
  }

  /**
   * 检查进程组是否匹配
   * @param {string} serverId - 服务器ID
   * @param {number} pid1 - 进程1的PID
   * @param {number} pid2 - 进程2的PID
   * @returns {Promise<boolean>} 是否属于同一进程组
   */
  async isSameProcessGroup(serverId, pid1, pid2) {
    try {
      const pgidResult1 = await this.sshManager.execCommand(serverId, `ps -p ${pid1} -o pgid --no-headers`)
      const pgidResult2 = await this.sshManager.execCommand(serverId, `ps -p ${pid2} -o pgid --no-headers`)

      if (pgidResult1.success && pgidResult2.success) {
        return pgidResult1.stdout.trim() === pgidResult2.stdout.trim()
      }
      return false
    } catch (error) {
      return false
    }
  }
}

export default BaseGPUHandler
