/**
 * 版本适配器
 * 根据工具版本适配命令格式
 */

class VersionAdapter {
  constructor() {
    // 工具版本适配规则
    this.adapters = {
      nvidia: {
        smi: {
          legacy: {
            versionRange: '<400',
            // 旧版本不需要特殊处理
            adapt: (cmd) => cmd
          },
          modern: {
            versionRange: '>=400',
            // 新版本使用 --query-gpu
            adapt: (cmd) => cmd
          }
        }
      },
      conda: {
        cli: {
          legacy: {
            versionRange: '<4.6',
            adapt: (cmd) => cmd
          },
          modern: {
            versionRange: '>=4.6',
            adapt: (cmd) => cmd
          }
        }
      },
      rocm: {
        smi: {
          legacy: {
            versionRange: '<3.0',
            adapt: (cmd) => {
              // 旧版本 ROCm 可能不支持 JSON 输出
              return cmd.replace('--json', '')
            }
          },
          modern: {
            versionRange: '>=3.0',
            adapt: (cmd) => cmd
          }
        }
      }
    }
  }

  /**
   * 适配命令
   * @param {string} tool - 工具名称
   * @param {string} command - 命令
   * @param {string} version - 版本号
   * @returns {string} 适配后的命令
   */
  adaptCommand(tool, command, version) {
    const toolAdapters = this.adapters[tool]

    if (!toolAdapters) {
      return command
    }

    for (const [name, adapters] of Object.entries(toolAdapters)) {
      for (const [type, config] of Object.entries(adapters)) {
        if (this.satisfiesVersion(version, config.versionRange)) {
          return config.adapt(command)
        }
      }
    }

    return command
  }

  /**
   * 检查版本是否满足范围
   * @param {string} version - 版本号
   * @param {string} range - 版本范围
   * @returns {boolean} 是否满足
   */
  satisfiesVersion(version, range) {
    if (!version) return false

    const [major, minor = 0, patch = 0] = version.split('.').map(Number)

    if (range.startsWith('>=')) {
      const required = parseInt(range.substring(2), 10)
      return major >= required
    }

    if (range.startsWith('>')) {
      const required = parseInt(range.substring(1), 10)
      if (minor !== undefined) {
        return major > required || (major === required && minor > 0)
      }
      return major > required
    }

    if (range.startsWith('<=')) {
      const required = parseInt(range.substring(2), 10)
      return major <= required
    }

    if (range.startsWith('<')) {
      const required = parseInt(range.substring(1), 10)
      return major < required
    }

    if (range.startsWith('~')) {
      // 波浪号范围 (~1.2.x 表示 >=1.2.0 <1.3.0)
      const requiredMajor = parseInt(range.substring(1).split('.')[0], 10)
      const requiredMinor = parseInt(range.substring(1).split('.')[1], 10)
      return major === requiredMajor && minor === requiredMinor
    }

    if (range.startsWith('^')) {
      // 插入号范围 (^1.2.3 表示 >=1.2.3 <2.0.0)
      const requiredMajor = parseInt(range.substring(1).split('.')[0], 10)
      return major === requiredMajor
    }

    // 精确匹配
    return version === range
  }

  /**
   * 获取工具版本
   * @param {string} tool - 工具名称
   * @param {string} command - 版本查询命令
   * @returns {Promise<string>} 版本号
   */
  async getToolVersion(tool, command) {
    // 这里应该执行命令获取版本
    // 具体实现依赖于命令执行器
    return null
  }

  /**
   * 添加适配规则
   * @param {string} tool - 工具名称
   * @param {string} name - 适配器名称
   * @param {string} versionRange - 版本范围
   * @param {Function} adapter - 适配函数
   */
  addAdapter(tool, name, versionRange, adapter) {
    if (!this.adapters[tool]) {
      this.adapters[tool] = {}
    }
    if (!this.adapters[tool][name]) {
      this.adapters[tool][name] = {}
    }

    this.adapters[tool][name] = {
      versionRange,
      adapt: adapter
    }
  }

  /**
   * 移除适配规则
   * @param {string} tool - 工具名称
   * @param {string} name - 适配器名称
   */
  removeAdapter(tool, name) {
    if (this.adapters[tool]) {
      delete this.adapters[tool][name]
    }
  }
}

// 创建单例
const versionAdapter = new VersionAdapter()

export default versionAdapter
export { VersionAdapter }
