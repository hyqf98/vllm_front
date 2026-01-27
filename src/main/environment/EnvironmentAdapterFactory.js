/**
 * 环境适配器工厂
 * 根据环境类型创建相应的适配器
 */

import CondaAdapter from './CondaAdapter.js'
import UVAdapter from './UVAdapter.js'
import VenvAdapter from './VenvAdapter.js'

class EnvironmentAdapterFactory {
  static TYPES = {
    CONDA: 'conda',
    UV: 'uv',
    VENV: 'venv'
  }

  /**
   * 创建环境适配器
   * @param {string} type - 环境类型
   * @param {Object} connection - 连接策略
   * @returns {EnvironmentAdapter} 环境适配器实例
   */
  static create(type, connection) {
    switch (type) {
      case this.TYPES.CONDA:
        return new CondaAdapter(connection)

      case this.TYPES.UV:
        return new UVAdapter(connection)

      case this.TYPES.VENV:
        return new VenvAdapter(connection)

      default:
        throw new Error(`未知的环境类型: ${type}`)
    }
  }

  /**
   * 自动检测并创建可用的环境适配器
   * @param {Object} connection - 连接策略
   * @returns {Promise<EnvironmentAdapter|null>} 环境适配器实例
   */
  static async autoDetect(connection) {
    // 按优先级检测
    const detectors = [
      // Conda
      async () => {
        try {
          const adapter = new CondaAdapter(connection)
          await adapter.findConda()
          // 验证是否可用
          const result = await adapter.listEnvironments()
          if (result) return adapter
        } catch {
          return null
        }
      },

      // UV
      async () => {
        try {
          const adapter = new UVAdapter(connection)
          await adapter.findUV()
          // 验证是否可用
          const result = await adapter.listEnvironments()
          if (result) return adapter
        } catch {
          return null
        }
      },

      // Venv (Python 内置，通常可用)
      async () => {
        try {
          const adapter = new VenvAdapter(connection)
          await adapter.findPython()
          return adapter
        } catch {
          return null
        }
      }
    ]

    for (const detector of detectors) {
      const adapter = await detector()
      if (adapter) {
        return adapter
      }
    }

    throw new Error('未检测到任何支持的 Python 环境管理工具')
  }

  /**
   * 获取支持的环境类型列表
   * @returns {Array<string>} 支持的类型列表
   */
  static getSupportedTypes() {
    return [
      this.TYPES.CONDA,
      this.TYPES.UV,
      this.TYPES.VENV
    ]
  }

  /**
   * 检查环境类型是否支持
   * @param {string} type - 环境类型
   * @returns {boolean} 是否支持
   */
  static isTypeSupported(type) {
    return this.getSupportedTypes().includes(type)
  }
}

export default EnvironmentAdapterFactory
