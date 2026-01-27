/**
 * 命令模板引擎
 * 渲染和管理命令模板
 */

import CommandTemplates from './templates/CommandTemplates.js'

class CommandTemplateEngine {
  /**
   * 渲染模板
   * @param {string} template - 模板字符串
   * @param {Object} variables - 变量对象
   * @returns {string} 渲染后的命令
   */
  static render(template, variables = {}) {
    let result = template

    // 替换所有 {{variable}} 占位符
    for (const [key, value] of Object.entries(variables)) {
      if (value === null || value === undefined) {
        continue
      }

      const pattern = new RegExp(`{{${key}}}`, 'g')
      result = result.replace(pattern, String(value))
    }

    return result
  }

  /**
   * 获取命令模板
   * @param {string} category - 类别（如 gpu, environment, system）
   * @param {string} type - 类型（如 nvidia, conda）
   * @param {string} action - 操作（如 query, list）
   * @param {Object} variables - 变量对象
   * @returns {string} 渲染后的命令
   */
  static getCommand(category, type, action, variables = {}) {
    const template = CommandTemplates[category]?.[type]?.[action]

    if (!template) {
      throw new Error(`未找到命令模板: ${category}.${type}.${action}`)
    }

    // 如果 template 是对象且有 template 属性，使用它
    const templateStr = template.template || template

    return this.render(templateStr, variables)
  }

  /**
   * 获取原始模板
   * @param {string} category - 类别
   * @param {string} type - 类型
   * @param {string} action - 操作
   * @returns {string|null} 模板字符串
   */
  static getTemplate(category, type, action) {
    const template = CommandTemplates[category]?.[type]?.[action]

    if (!template) {
      return null
    }

    return template.template || template
  }

  /**
   * 检查模板是否存在
   * @param {string} category - 类别
   * @param {string} type - 类型
   * @param {string} action - 操作
   * @returns {boolean} 是否存在
   */
  static hasTemplate(category, type, action) {
    return !!CommandTemplates[category]?.[type]?.[action]
  }

  /**
   * 获取所有类别
   * @returns {Array<string>} 类别列表
   */
  static getCategories() {
    return Object.keys(CommandTemplates)
  }

  /**
   * 获取类别下的所有类型
   * @param {string} category - 类别
   * @returns {Array<string>} 类型列表
   */
  static getTypes(category) {
    if (!CommandTemplates[category]) {
      return []
    }
    return Object.keys(CommandTemplates[category])
  }

  /**
   * 获取类型下的所有操作
   * @param {string} category - 类别
   * @param {string} type - 类型
   * @returns {Array<string>} 操作列表
   */
  static getActions(category, type) {
    if (!CommandTemplates[category]?.[type]) {
      return []
    }
    return Object.keys(CommandTemplates[category][type])
  }

  /**
   * 批量渲染命令
   * @param {Array} commands - 命令配置数组
   * @returns {Array<string>} 渲染后的命令数组
   */
  static batchRender(commands) {
    return commands.map(cmd => {
      const { category, type, action, variables = {} } = cmd
      return this.getCommand(category, type, action, variables)
    })
  }

  /**
   * 添加自定义模板
   * @param {string} category - 类别
   * @param {string} type - 类型
   * @param {string} action - 操作
   * @param {string} template - 模板字符串
   */
  static addTemplate(category, type, action, template) {
    if (!CommandTemplates[category]) {
      CommandTemplates[category] = {}
    }
    if (!CommandTemplates[category][type]) {
      CommandTemplates[category][type] = {}
    }
    CommandTemplates[category][type][action] = template
  }

  /**
   * 验证模板变量
   * @param {string} template - 模板字符串
   * @param {Object} variables - 变量对象
   * @returns {Object} 验证结果 { valid: boolean, missing: string[] }
   */
  static validateVariables(template, variables) {
    const missing = []
    const matches = template.matchAll(/{{(\w+)}}/g)

    for (const match of matches) {
      const varName = match[1]
      if (!(varName in variables)) {
        missing.push(varName)
      }
    }

    return {
      valid: missing.length === 0,
      missing
    }
  }
}

export default CommandTemplateEngine
