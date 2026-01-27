/**
 * Conda 环境适配器
 * 支持 Conda/Miniconda/Miniforge 环境管理
 */

import EnvironmentAdapter from './EnvironmentAdapter.js'

class CondaAdapter extends EnvironmentAdapter {
  constructor(connectionStrategy) {
    super(connectionStrategy)
    this.condaPath = null
  }

  /**
   * 查找 Conda 可执行文件路径
   * @returns {Promise<string>} Conda 路径
   */
  async findConda() {
    if (this.condaPath) {
      return this.condaPath
    }

    const cacheKey = 'conda_path'
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      this.condaPath = cached
      return this.condaPath
    }

    // 并行检测多种方法
    const methods = [
      // 方法1: 系统路径中查找
      async () => {
        const result = await this.connection.execute('which conda 2>/dev/null || echo "not_found"')
        if (result.success && result.stdout.trim() !== 'not_found') {
          return result.stdout.trim()
        }
        return null
      },

      // 方法2: 常见路径检测
      async () => {
        const paths = [
          '~/anaconda3/bin/conda',
          '~/miniconda3/bin/conda',
          '~/miniforge3/bin/conda',
          '/opt/anaconda3/bin/conda',
          '/opt/miniconda3/bin/conda',
          '/opt/miniforge3/bin/conda',
          '/usr/local/anaconda3/bin/conda',
          '/usr/local/miniconda3/bin/conda'
        ]

        for (const path of paths) {
          const result = await this.connection.execute(`test -f ${path} && echo "found" || echo "not_found"`)
          if (result.success && result.stdout.includes('found')) {
            return path
          }
        }
        return null
      }
    ]

    // 并行执行所有方法，返回第一个成功的结果
    const results = await Promise.all(methods.map(m => m()))
    this.condaPath = results.find(r => r !== null) || 'conda'

    this.setCache(cacheKey, this.condaPath)
    return this.condaPath
  }

  /**
   * 列出所有 Conda 环境
   * @returns {Promise<Array>} 环境列表
   */
  async listEnvironments() {
    const conda = await this.findConda()
    const cacheKey = 'conda_envs'
    const cached = this.getFromCache(cacheKey)
    if (cached) return cached

    const result = await this.connection.execute(`${conda} env list --json`)

    if (!result.success) {
      throw new Error(`获取 Conda 环境列表失败: ${result.stderr}`)
    }

    const data = JSON.parse(result.stdout)
    const environments = data.envs.map(path => ({
      name: path.split('/').pop(),
      path,
      type: 'conda'
    }))

    this.setCache(cacheKey, environments)
    return environments
  }

  /**
   * 创建新环境
   * @param {string} name - 环境名称
   * @param {string} pythonVersion - Python 版本
   * @returns {Promise<Object>} 创建结果
   */
  async createEnvironment(name, pythonVersion = '3.10') {
    const conda = await this.findConda()
    const result = await this.connection.execute(
      `${conda} create -n ${name} python=${pythonVersion} -y`
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
    const conda = await this.findConda()
    const result = await this.connection.execute(`${conda} env remove -n ${name} -y`)

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
    const conda = await this.findConda()
    const packageSpec = version ? `${packageName}==${version}` : packageName

    const result = await this.connection.execute(
      `${conda} install -n ${envName} ${packageSpec} -y`
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
    const conda = await this.findConda()
    const result = await this.connection.execute(
      `${conda} remove -n ${envName} ${packageName} -y`
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
    const conda = await this.findConda()
    const result = await this.connection.execute(
      `${conda} list -n ${envName} --json`
    )

    if (!result.success) {
      throw new Error(`获取包列表失败: ${result.stderr}`)
    }

    return JSON.parse(result.stdout)
  }

  /**
   * 获取 Conda 数据源配置
   * @returns {Promise<Object>} 数据源配置
   */
  async getDataSource() {
    const conda = await this.findConda()
    const result = await this.connection.execute(`${conda} config --show channels --json`)

    if (!result.success) {
      throw new Error(`获取 Conda 数据源失败: ${result.stderr}`)
    }

    const data = JSON.parse(result.stdout)
    return {
      channels: data.channels || []
    }
  }

  /**
   * 设置 Conda 数据源
   * @param {Array<string>} channels - 数据源列表
   * @returns {Promise<Object>} 设置结果
   */
  async setDataSource(channels) {
    const conda = await this.findConda()

    // 先删除所有现有数据源
    await this.connection.execute(`${conda} config --remove channels`)

    // 添加新数据源
    const channelsStr = channels.join(' ')
    const result = await this.connection.execute(
      `${conda} config --add channels ${channelsStr}`
    )

    return {
      success: result.success,
      message: result.success ? '数据源设置成功' : result.stderr
    }
  }
}

export default CondaAdapter
