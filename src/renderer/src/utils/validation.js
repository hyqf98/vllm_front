/**
 * 验证工具函数
 */

import { SERVER_TYPES } from './constants.js'

/**
 * 验证服务器配置
 * @param {Object} server - 服务器配置对象
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateServer(server) {
  const errors = []

  if (!server) {
    errors.push('服务器配置不能为空')
    return { valid: false, errors }
  }

  // 验证名称
  if (!server.name || server.name.trim() === '') {
    errors.push('服务器名称不能为空')
  }

  // 验证类型
  if (!server.type || !Object.values(SERVER_TYPES).includes(server.type)) {
    errors.push(`服务器类型必须是以下之一: ${Object.values(SERVER_TYPES).join(', ')}`)
  }

  // SSH 类型服务器特定验证
  if (server.type === SERVER_TYPES.SSH) {
    if (!server.host || server.host.trim() === '') {
      errors.push('服务器地址不能为空')
    }

    // 验证主机名格式
    const hostRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$|^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
    if (server.host && !hostRegex.test(server.host)) {
      errors.push('服务器地址格式不正确')
    }

    if (!server.port || server.port < 1 || server.port > 65535) {
      errors.push('端口号必须在 1-65535 之间')
    }

    if (!server.username || server.username.trim() === '') {
      errors.push('用户名不能为空')
    }

    if (!server.password && !server.privateKey) {
      errors.push('密码或私钥至少需要一个')
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 验证命令安全性（防止命令注入）
 * @param {string} command - 要验证的命令
 * @returns {boolean} 是否安全
 */
export function isCommandSafe(command) {
  if (!command || typeof command !== 'string') {
    return false
  }

  // 危险字符列表
  const dangerousChars = [';', '|', '&', '$', '`', '(', ')', '<', '>', '\n', '\r']

  for (const char of dangerousChars) {
    if (command.includes(char)) {
      return false
    }
  }

  return true
}

/**
 * 验证端口范围
 * @param {number} port - 端口号
 * @returns {boolean} 是否有效
 */
export function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

/**
 * 验证 IP 地址
 * @param {string} ip - IP 地址
 * @returns {boolean} 是否有效
 */
export function isValidIP(ip) {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
  if (!ipRegex.test(ip)) {
    return false
  }

  const parts = ip.split('.')
  return parts.every(part => {
    const num = parseInt(part, 10)
    return num >= 0 && num <= 255
  })
}

/**
 * 验证主机名
 * @param {string} hostname - 主机名
 * @returns {boolean} 是否有效
 */
export function isValidHostname(hostname) {
  if (!hostname || hostname.length > 253) {
    return false
  }

  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return hostnameRegex.test(hostname)
}

/**
 * 验证 URL
 * @param {string} url - URL 字符串
 * @returns {boolean} 是否有效
 */
export function isValidURL(url) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * 验证环境名称
 * @param {string} name - 环境名称
 * @returns {boolean} 是否有效
 */
export function isValidEnvironmentName(name) {
  if (!name || typeof name !== 'string') {
    return false
  }

  // 环境名称规则: 只能包含字母、数字、下划线和连字符，且不能以连字符开头
  const envNameRegex = /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/
  return envNameRegex.test(name)
}
