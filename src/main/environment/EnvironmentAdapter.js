/**
 * 环境适配器抽象类
 * 统一不同环境管理工具的接口
 */

class EnvironmentAdapter {
  constructor(connectionStrategy) {
    if (new.target === EnvironmentAdapter) {
      throw new Error('EnvironmentAdapter 是抽象类，不能直接实例化')
    }
    this.connection = connectionStrategy
    this.cache = new Map()
    this.cacheTimeout = 60000 // 缓存60秒
  }

  /**
   * 列出所有环境
   * @returns {Promise<Array>} 环境列表
   */
  async listEnvironments() {
    throw new Error('子类必须实现 listEnvironments 方法')
  }

  /**
   * 创建新环境
   * @param {string} name - 环境名称
   * @param {string} pythonVersion - Python 版本
   * @returns {Promise<Object>} 创建结果
   */
  async createEnvironment(name, pythonVersion) {
    throw new Error('子类必须实现 createEnvironment 方法')
  }

  /**
   * 删除环境
   * @param {string} name - 环境名称
   * @returns {Promise<Object>} 删除结果
   */
  async deleteEnvironment(name) {
    throw new Error('子类必须实现 deleteEnvironment 方法')
  }

  /**
   * 安装包
   * @param {string} envName - 环境名称
   * @param {string} packageName - 包名
   * @param {string} version - 版本
   * @returns {Promise<Object>} 安装结果
   */
  async installPackage(envName, packageName, version = null) {
    throw new Error('子类必须实现 installPackage 方法')
  }

  /**
   * 卸载包
   * @param {string} envName - 环境名称
   * @param {string} packageName - 包名
   * @returns {Promise<Object>} 卸载结果
   */
  async uninstallPackage(envName, packageName) {
    throw new Error('子类必须实现 uninstallPackage 方法')
  }

  /**
   * 列出已安装的包
   * @param {string} envName - 环境名称
   * @returns {Promise<Array>} 包列表
   */
  async listPackages(envName) {
    throw new Error('子类必须实现 listPackages 方法')
  }

  /**
   * 获取缓存数据
   * @param {string} key - 缓存键
   * @returns {*} 缓存值
   */
  getFromCache(key) {
    const cached = this.cache.get(key)
    if (!cached) return null

    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  /**
   * 设置缓存数据
   * @param {string} key - 缓存键
   * @param {*} data - 缓存数据
   */
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear()
  }

  /**
   * 检查环境是否存在
   * @param {string} name - 环境名称
   * @returns {Promise<boolean>} 是否存在
   */
  async environmentExists(name) {
    const environments = await this.listEnvironments()
    return environments.some(env => env.name === name)
  }
}

export default EnvironmentAdapter
