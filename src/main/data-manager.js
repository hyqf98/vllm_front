/**
 * 数据持久化管理模块
 * 负责在用户目录下存储和读取应用数据
 */
import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'

class DataManager {
  constructor() {
    // 获取用户根目录
    this.userHomePath = app.getPath('home')
    // 在用户根目录下创建应用数据目录（隐藏目录）
    this.dataDir = join(this.userHomePath, '.vllm_front')
  }

  /**
   * 验证数据是否可以序列化
   * @param {any} data - 要验证的数据
   * @returns {{ valid: boolean, error?: string }}
   */
  validateSerializable(data) {
    try {
      JSON.stringify(data)
      return { valid: true }
    } catch (error) {
      return { valid: false, error: error.message }
    }
  }

  /**
   * 确保数据目录存在
   * 每次都检查目录是否真实存在
   */
  async ensureDataDir() {
    try {
      // 检查目录是否已存在
      await fs.access(this.dataDir)
    } catch (error) {
      // 目录不存在，创建目录
      if (error.code === 'ENOENT') {
        await fs.mkdir(this.dataDir, { recursive: true })
      } else {
        throw error
      }
    }
  }

  /**
   * 获取数据文件路径
   * @param {string} moduleName - 模块名称
   * @returns {string} 文件完整路径
   */
  getDataFilePath(moduleName) {
    return join(this.dataDir, `${moduleName}.json`)
  }

  /**
   * 读取数据
   * @param {string} moduleName - 模块名称
   * @param {any} defaultValue - 默认值
   * @returns {Promise<any>} 读取的数据
   */
  async readData(moduleName, defaultValue = null) {
    const filePath = this.getDataFilePath(moduleName)
    const backupFilePath = filePath + '.bak'

    try {
      // 确保目录存在
      await this.ensureDataDir()

      const content = await fs.readFile(filePath, 'utf-8')

      // 检查内容是否为空
      if (!content || content.trim() === '') {
        console.warn(`数据文件为空 [${moduleName}]，返回默认值`)
        return defaultValue
      }

      return JSON.parse(content)
    } catch (error) {
      // 文件不存在或读取失败，返回默认值
      if (error.code === 'ENOENT') {
        return defaultValue
      }
      // JSON 解析错误（文件内容损坏），尝试修复
      if (error instanceof SyntaxError) {
        console.error(`数据文件内容无效 [${moduleName}]:`, error.message)

        // 尝试从备份恢复
        try {
          const backupContent = await fs.readFile(backupFilePath, 'utf-8')
          const backupData = JSON.parse(backupContent)
          console.log(`[DataManager] 从备份恢复数据 [${moduleName}]`)

          // 恢复成功，写回主文件
          await fs.writeFile(filePath, backupContent, 'utf-8')
          return backupData
        } catch (backupError) {
          console.error(`[DataManager] 备份文件也损坏或不存在 [${moduleName}]`)

          // 尝试自动修复常见的 JSON 问题
          try {
            const content = await fs.readFile(filePath, 'utf-8')
            const fixedContent = this.fixJSON(content)
            if (fixedContent) {
              const fixedData = JSON.parse(fixedContent)
              console.log(`[DataManager] 自动修复 JSON 成功 [${moduleName}]`)

              // 保存修复后的内容
              await fs.writeFile(filePath, fixedContent, 'utf-8')
              return fixedData
            }
          } catch (fixError) {
            console.error(`[DataManager] 自动修复失败 [${moduleName}]:`, fixError.message)
          }

          return defaultValue
        }
      }
      console.error(`读取数据失败 [${moduleName}]:`, error)
      return defaultValue
    }
  }

  /**
   * 尝试修复常见的 JSON 问题
   * @param {string} content - 损坏的 JSON 内容
   * @returns {string|null} 修复后的内容，无法修复返回 null
   */
  fixJSON(content) {
    try {
      // 尝试直接解析
      JSON.parse(content)
      return content
    } catch (e) {
      // 问题 1: 多余的 ]] -> ]
      let fixed = content.replace(/\]\]+$/, ']')

      // 问题 2: 多余的 ,] -> ]
      fixed = fixed.replace(/,\s*\]/g, ']')

      // 问题 3: 多余的 ,} -> }
      fixed = fixed.replace(/,\s*\}/g, '}')

      // 问题 4: 数组最后有多余的逗号
      fixed = fixed.replace(/,\s*(\])/, '$1')

      // 验证修复后的内容
      try {
        JSON.parse(fixed)
        return fixed
      } catch (e2) {
        return null
      }
    }
  }

  /**
   * 写入数据
   * @param {string} moduleName - 模块名称
   * @param {any} data - 要写入的数据
   * @returns {Promise<boolean>} 是否成功
   */
  async writeData(moduleName, data) {
    const filePath = this.getDataFilePath(moduleName)
    const tempFilePath = filePath + '.tmp'

    try {
      console.log(`[DataManager] 开始写入数据 [${moduleName}]`)
      console.log(`[DataManager] 数据目录: ${this.dataDir}`)
      console.log(`[DataManager] 文件路径: ${filePath}`)
      console.log(`[DataManager] 临时文件路径: ${tempFilePath}`)

      // 确保目录存在
      await this.ensureDataDir()

      // 再次确认目录存在（防止竞争条件）
      try {
        await fs.access(this.dataDir)
        console.log(`[DataManager] 目录已存在`)
      } catch {
        console.log(`[DataManager] 目录不存在，创建目录`)
        await fs.mkdir(this.dataDir, { recursive: true })
      }

      // 序列化数据
      let content
      try {
        content = JSON.stringify(data, null, 2)
        console.log(`[DataManager] 序列化成功，内容长度: ${content.length}`)
      } catch (serializeError) {
        console.error(`[DataManager] 序列化失败 [${moduleName}]:`, serializeError)
        throw new Error(`数据序列化失败: ${serializeError.message}`)
      }

      // 先写入临时文件
      console.log(`[DataManager] 写入临时文件: ${tempFilePath}`)
      await fs.writeFile(tempFilePath, content, 'utf-8')
      console.log(`[DataManager] 临时文件写入成功`)

      // 验证临时文件是否创建成功并验证 JSON 格式
      await fs.access(tempFilePath)
      console.log(`[DataManager] 临时文件存在验证通过`)

      const tempContent = await fs.readFile(tempFilePath, 'utf-8')
      console.log(`[DataManager] 临时文件读取成功，长度: ${tempContent.length}`)

      JSON.parse(tempContent) // 验证 JSON 有效性
      console.log(`[DataManager] 临时文件 JSON 验证通过`)

      // 删除旧文件（如果存在）
      try {
        await fs.unlink(filePath)
        console.log(`[DataManager] 旧文件已删除`)
      } catch (e) {
        if (e.code === 'ENOENT') {
          console.log(`[DataManager] 旧文件不存在，跳过删除`)
        } else {
          console.warn(`[DataManager] 删除旧文件失败:`, e.message)
        }
      }

      // 重命名到目标文件
      await fs.rename(tempFilePath, filePath)
      console.log(`[DataManager] 文件重命名成功`)

      // 创建备份文件
      try {
        await fs.writeFile(filePath + '.bak', content, 'utf-8')
        console.log(`[DataManager] 备份文件创建成功`)
      } catch (backupError) {
        console.warn(`[DataManager] 创建备份失败 [${moduleName}]:`, backupError.message)
      }

      console.log(`[DataManager] 写入完成 [${moduleName}]`)

      return true
    } catch (error) {
      console.error(`[DataManager] 写入数据失败 [${moduleName}]:`, error)
      console.error(`[DataManager] 错误类型: ${error.name}`)
      console.error(`[DataManager] 错误消息: ${error.message}`)
      console.error(`[DataManager] 错误堆栈: ${error.stack}`)

      // 清理可能残留的临时文件
      try {
        await fs.unlink(tempFilePath)
        console.log(`[DataManager] 临时文件已清理`)
      } catch {}

      return false
    }
  }

  /**
   * 删除数据
   * @param {string} moduleName - 模块名称
   * @returns {Promise<boolean>} 是否成功
   */
  async deleteData(moduleName) {
    try {
      const filePath = this.getDataFilePath(moduleName)
      await fs.unlink(filePath)
      return true
    } catch (error) {
      if (error.code === 'ENOENT') {
        return true // 文件不存在，认为删除成功
      }
      console.error(`删除数据失败 [${moduleName}]:`, error)
      return false
    }
  }

  /**
   * 检查数据是否存在
   * @param {string} moduleName - 模块名称
   * @returns {Promise<boolean>} 是否存在
   */
  async existsData(moduleName) {
    try {
      // 确保目录存在
      await this.ensureDataDir()

      const filePath = this.getDataFilePath(moduleName)
      await fs.access(filePath)
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * 获取所有数据模块列表
   * @returns {Promise<Array<string>>} 模块名称列表
   */
  async listDataModules() {
    try {
      // 确保目录存在
      await this.ensureDataDir()

      const files = await fs.readdir(this.dataDir)
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''))
    } catch (error) {
      console.error('获取数据模块列表失败:', error)
      return []
    }
  }

  /**
   * 清空所有数据
   * @returns {Promise<boolean>} 是否成功
   */
  async clearAllData() {
    try {
      const modules = await this.listDataModules()
      for (const module of modules) {
        await this.deleteData(module)
      }
      return true
    } catch (error) {
      console.error('清空数据失败:', error)
      return false
    }
  }

  /**
   * 清空所有数据并删除目录
   * @returns {Promise<boolean>} 是否成功
   */
  async clearAllDataAndDirectory() {
    try {
      const fs2 = await import('fs')
      const { promises } = fs2

      // 先清空所有文件
      await this.clearAllData()

      // 删除整个目录
      await promises.rm(this.dataDir, { recursive: true, force: true })

      // 重新创建目录
      await this.ensureDataDir()

      return true
    } catch (error) {
      console.error('清空数据和目录失败:', error)
      return false
    }
  }
}

// 导出单例
export default new DataManager()
