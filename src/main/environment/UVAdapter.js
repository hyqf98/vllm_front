/**
 * UV 环境适配器
 * 支持 UV 环境管理工具
 */

import EnvironmentAdapter from './EnvironmentAdapter.js'

class UVAdapter extends EnvironmentAdapter {
  constructor(connectionStrategy) {
    super(connectionStrategy)
    this.uvPath = null
  }

  /**
   * 查找 UV 可执行文件路径
   * @returns {Promise<string>} UV 路径
   */
  async findUV() {
    if (this.uvPath) {
      return this.uvPath
    }

    const cacheKey = 'uv_path'
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      this.uvPath = cached
      return this.uvPath
    }

    // 系统路径中查找
    const result = await this.connection.execute('which uv 2>/dev/null || echo "not_found"')

    if (result.success && result.stdout.trim() !== 'not_found') {
      this.uvPath = result.stdout.trim()
    } else {
      this.uvPath = 'uv'
    }

    this.setCache(cacheKey, this.uvPath)
    return this.uvPath
  }

  /**
   * 列出所有 UV 环境
   * @returns {Promise<Array>} 环境列表
   */
  async listEnvironments() {
    const uv = await this.findUV()
    const cacheKey = 'uv_envs'
    const cached = this.getFromCache(cacheKey)
    if (cached) return cached

    const result = await this.connection.execute(`${uv} venv list --json`)

    if (!result.success) {
      // 如果命令失败，返回空列表（可能不支持 --json 选项）
      return []
    }

    try {
      const data = JSON.parse(result.stdout)
      const environments = data.map(env => ({
        name: env.name,
        path: env.path,
        type: 'uv'
      }))

      this.setCache(cacheKey, environments)
      return environments
    } catch {
      return []
    }
  }

  /**
   * 创建新环境
   * @param {string} name - 环境名称
   * @param {string} pythonVersion - Python 版本
   * @returns {Promise<Object>} 创建结果
   */
  async createEnvironment(name, pythonVersion = '3.10') {
    const uv = await this.findUV()
    const result = await this.connection.execute(
      `${uv} venv ${name} --python ${pythonVersion}`
    )

    // 清空缓存
    this.clearCache()

    return {
      success: result.success,
      message: result.success ? `环境 ${name} 创建成功` : result.stderr
    }
  }

  /**
   * 删除环境
   * @param {string} name - 环境名称
   * @returns {Promise<Object>} 删除结果
   */
  async deleteEnvironment(name) {
    const uv = await this.findUV()
    const result = await this.connection.execute(`${uv} venv remove ${name}`)

    // 清空缓存
    this.clearCache()

    return {
      success: result.success,
      message: result.success ? `环境 ${name} 删除成功` : result.stderr
    }
  }

  /**
   * 安装包
   * @param {string} envName - 环境名称
   * @param {string} packageName - 包名
   * @param {string} version - 版本
   * @returns {Promise<Object>} 安装结果
   */
  async installPackage(envName, packageName, version = null) {
    const uv = await this.findUV()
    const packageSpec = version ? `${packageName}==${version}` : packageName

    const result = await this.connection.execute(
      `${uv} pip install --python ${envName} ${packageSpec}`
    )

    return {
      success: result.success,
      message: result.success ? '包安装成功' : result.stderr
    }
  }

  /**
   * 卸载包
   * @param {string} envName - 环境名称
   * @param {string} packageName - 包名
   * @returns {Promise<Object>} 卸载结果
   */
  async uninstallPackage(envName, packageName) {
    const uv = await this.findUV()
    const result = await this.connection.execute(
      `${uv} pip uninstall --python ${envName} ${packageName} -y`
    )

    return {
      success: result.success,
      message: result.success ? '包卸载成功' : result.stderr
    }
  }

  /**
   * 列出已安装的包
   * @param {string} envName - 环境名称
   * @returns {Promise<Array>} 包列表
   */
  async listPackages(envName) {
    const uv = await this.findUV()
    const result = await this.connection.execute(
      `${uv} pip list --python ${envName} --json`
    )

    if (!result.success) {
      throw new Error(`获取包列表失败: ${result.stderr}`)
    }

    return JSON.parse(result.stdout)
  }
}

export default UVAdapter
