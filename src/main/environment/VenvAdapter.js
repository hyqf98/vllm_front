/**
 * Venv 环境适配器
 * 支持 Python 内置的 venv 模块
 */

import EnvironmentAdapter from './EnvironmentAdapter.js'

class VenvAdapter extends EnvironmentAdapter {
  constructor(connectionStrategy) {
    super(connectionStrategy)
    this.pythonPath = null
  }

  /**
   * 查找 Python 可执行文件路径
   * @returns {Promise<string>} Python 路径
   */
  async findPython() {
    if (this.pythonPath) {
      return this.pythonPath
    }

    const cacheKey = 'python_path'
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      this.pythonPath = cached
      return this.pythonPath
    }

    // 系统路径中查找
    const result = await this.connection.execute('which python3 2>/dev/null || which python 2>/dev/null || echo "not_found"')

    if (result.success && result.stdout.trim() !== 'not_found') {
      this.pythonPath = result.stdout.trim()
    } else {
      this.pythonPath = 'python3'
    }

    this.setCache(cacheKey, this.pythonPath)
    return this.pythonPath
  }

  /**
   * 列出所有 Venv 环境
   * @returns {Promise<Array>} 环境列表
   */
  async listEnvironments() {
    // Venv 没有中央环境列表，返回空数组
    // 用户需要知道环境的具体路径
    return []
  }

  /**
   * 创建新环境
   * @param {string} name - 环境名称
   * @param {string} pythonVersion - Python 版本（对 venv 无效）
   * @returns {Promise<Object>} 创建结果
   */
  async createEnvironment(name, pythonVersion = null) {
    const python = await this.findPython()
    const result = await this.connection.execute(`${python} -m venv ${name}`)

    // 清空缓存
    this.clearCache()

    return {
      success: result.success,
      message: result.success ? `环境 ${name} 创建成功` : result.stderr
    }
  }

  /**
   * 删除环境
   * @param {string} name - 环境路径/名称
   * @returns {Promise<Object>} 删除结果
   */
  async deleteEnvironment(name) {
    const result = await this.connection.execute(`rm -rf ${name}`)

    // 清空缓存
    this.clearCache()

    return {
      success: result.success,
      message: result.success ? `环境 ${name} 删除成功` : result.stderr
    }
  }

  /**
   * 安装包
   * @param {string} envName - 环境路径
   * @param {string} packageName - 包名
   * @param {string} version - 版本
   * @returns {Promise<Object>} 安装结果
   */
  async installPackage(envName, packageName, version = null) {
    const packageSpec = version ? `${packageName}==${version}` : packageName
    const pipPath = `${envName}/bin/pip`

    const result = await this.connection.execute(
      `${pipPath} install ${packageSpec}`
    )

    return {
      success: result.success,
      message: result.success ? '包安装成功' : result.stderr
    }
  }

  /**
   * 卸载包
   * @param {string} envName - 环境路径
   * @param {string} packageName - 包名
   * @returns {Promise<Object>} 卸载结果
   */
  async uninstallPackage(envName, packageName) {
    const pipPath = `${envName}/bin/pip`
    const result = await this.connection.execute(
      `${pipPath} uninstall ${packageName} -y`
    )

    return {
      success: result.success,
      message: result.success ? '包卸载成功' : result.stderr
    }
  }

  /**
   * 列出已安装的包
   * @param {string} envName - 环境路径
   * @returns {Promise<Array>} 包列表
   */
  async listPackages(envName) {
    const pipPath = `${envName}/bin/pip`
    const result = await this.connection.execute(`${pipPath} list --json`)

    if (!result.success) {
      throw new Error(`获取包列表失败: ${result.stderr}`)
    }

    return JSON.parse(result.stdout)
  }
}

export default VenvAdapter
