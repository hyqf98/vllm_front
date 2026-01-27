/**
 * GPU 处理器基类
 * 统一不同厂商 GPU 的操作接口
 */

class BaseGPUHandler {
  constructor(connection) {
    if (new.target === BaseGPUHandler) {
      throw new Error('BaseGPUHandler 是抽象类，不能直接实例化')
    }
    this.connection = connection
  }

  /**
   * 获取 GPU 厂商名称
   * @returns {string} 厂商名称
   */
  getVendorName() {
    throw new Error('子类必须实现 getVendorName 方法')
  }

  /**
   * 检查 GPU 是否可用
   * @param {string} serverId - 服务器ID
   * @returns {Promise<boolean>} 是否可用
   */
  async isAvailable(serverId) {
    throw new Error('子类必须实现 isAvailable 方法')
  }

  /**
   * 获取所有 GPU 进程
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 进程列表
   */
  async getAllProcesses(serverId) {
    throw new Error('子类必须实现 getAllProcesses 方法')
  }

  /**
   * 获取 GPU 信息
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array>} GPU 信息列表
   */
  async getGPUInfo(serverId) {
    throw new Error('子类必须实现 getGPUInfo 方法')
  }

  /**
   * 终止 GPU 进程
   * @param {string} serverId - 服务器ID
   * @param {number} pid - 进程ID
   * @returns {Promise<Object>} 执行结果
   */
  async killProcess(serverId, pid) {
    const command = `kill -9 ${pid}`
    return this.connection.execute(command)
  }

  /**
   * 批量终止 GPU 进程
   * @param {string} serverId - 服务器ID
   * @param {Array<number>} pids - 进程ID列表
   * @returns {Promise<Object>} 执行结果
   */
  async killBatchProcesses(serverId, pids) {
    if (!pids || pids.length === 0) {
      return { success: true, message: '没有需要终止的进程' }
    }

    const pidsStr = pids.join(' ')
    const command = `kill -9 ${pidsStr}`
    return this.connection.execute(command)
  }

  /**
   * 解析内存大小
   * @param {string} memStr - 内存字符串 (如 "1024", "1024MiB")
   * @returns {number} 字节数
   */
  parseMemory(memStr) {
    if (!memStr) return 0

    // 移除单位后缀
    const value = parseInt(memStr.toString().replace(/[^\d]/g, ''), 10)
    return value || 0
  }

  /**
   * 格式化内存大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的字符串
   */
  formatMemory(bytes) {
    if (!bytes) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
}

export default BaseGPUHandler
