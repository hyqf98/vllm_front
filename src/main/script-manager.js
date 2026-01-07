/**
 * 脚本管理器模块
 * 负责加载和执行系统信息收集脚本
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { app } from 'electron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

class ScriptManager {
  constructor() {
    // 脚本文件映射
    this.scriptFiles = {
      ubuntu: 'cmd_ubuntu.sh',
      centos: 'cmd_centos.sh',
      linux: 'cmd_linux.sh',
      darwin: 'cmd_darwin.sh',
      windows: 'cmd_windows.ps1'
    }

    // 脚本缓存
    this.scriptCache = new Map()
  }

  /**
   * 获取资源目录的基础路径
   * 开发环境：项目根目录/resources
   * 生产环境：app.getPath('userData') 或 process.resourcesPath
   */
  getResourcesPath() {
    try {
      // 生产环境：优先使用 process.resourcesPath
      if (process.resourcesPath && existsSync(join(process.resourcesPath, 'resources', 'scripts'))) {
        console.log('[ScriptManager] 使用 process.resourcesPath:', process.resourcesPath)
        return join(process.resourcesPath, 'resources')
      }

      // 备用：使用 userData 目录下的资源
      const userDataPath = app.getPath('userData')
      const resourcesInUserData = join(userDataPath, 'resources')
      if (existsSync(resourcesInUserData)) {
        console.log('[ScriptManager] 使用 userData 目录:', resourcesInUserData)
        return resourcesInUserData
      }

      // 开发环境：项目根目录
      // 从 src/main 向上两级到达项目根目录
      const projectRoot = resolve(__dirname, '..', '..')
      const devResourcesPath = join(projectRoot, 'resources')

      if (existsSync(devResourcesPath)) {
        return devResourcesPath
      }

      // 如果都不存在，返回默认路径
      return join(projectRoot, 'resources')
    } catch (error) {
      console.error('[ScriptManager] 获取资源路径失败:', error.message)
      // 返回项目根目录下的 resources
      return resolve(__dirname, '..', '..', 'resources')
    }
  }

  /**
   * 获取脚本文件路径
   * @param {string} osType - 操作系统类型 (ubuntu, centos, linux, darwin, windows)
   * @returns {string} 脚本文件路径
   */
  getScriptPath(osType) {
    const scriptFile = this.scriptFiles[osType] || this.scriptFiles.linux
    const resourcesPath = this.getResourcesPath()
    const scriptPath = join(resourcesPath, 'scripts', scriptFile)
    return scriptPath
  }

  /**
   * 加载脚本内容
   * @param {string} osType - 操作系统类型
   * @returns {string} 脚本内容
   */
  loadScript(osType) {
    // 检查缓存
    if (this.scriptCache.has(osType)) {
      return this.scriptCache.get(osType)
    }

    try {
      const scriptPath = this.getScriptPath(osType)
      const scriptContent = readFileSync(scriptPath, 'utf-8')

      // 缓存脚本内容
      this.scriptCache.set(osType, scriptContent)
      return scriptContent
    } catch (error) {
      throw new Error(`无法加载 ${osType} 系统的查询脚本: ${error.message}`)
    }
  }

  /**
   * 获取脚本执行命令
   * @param {string} osType - 操作系统类型
   * @returns {string} 执行命令
   */
  getExecutionCommand(osType) {
    switch (osType) {
      case 'windows':
        return 'powershell.exe -ExecutionPolicy Bypass -File -'

      case 'darwin':
      case 'ubuntu':
      case 'centos':
      case 'linux':
      default:
        return 'bash'
    }
  }

  /**
   * 获取脚本的完整内容（包含 shebang）
   * @param {string} osType - 操作系统类型
   * @returns {string} 脚本内容
   */
  getScriptContent(osType) {
    return this.loadScript(osType)
  }

  /**
   * 清除脚本缓存
   * @param {string} osType - 操作系统类型（可选，不传则清除所有）
   */
  clearCache(osType) {
    if (osType) {
      this.scriptCache.delete(osType)
    } else {
      this.scriptCache.clear()
    }
  }

  /**
   * 预加载所有脚本
   * @returns {Object} 加载结果统计
   */
  preloadAllScripts() {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    }

    for (const osType of Object.keys(this.scriptFiles)) {
      try {
        this.loadScript(osType)
        results.success++
      } catch (error) {
        results.failed++
        results.errors.push({
          osType,
          error: error.message
        })
      }
    }

    return results
  }
}

// 导出单例
export default new ScriptManager()
