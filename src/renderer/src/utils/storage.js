/**
 * 存储工具函数
 */

/**
 * 深度克隆对象
 * @param {*} obj - 要克隆的对象
 * @returns {*} 克隆后的对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime())
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item))
  }

  if (obj instanceof Object) {
    const clonedObj = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key])
      }
    }
    return clonedObj
  }
}

/**
 * 序列化数据（用于存储到 Store 或持久化）
 * @param {*} data - 要序列化的数据
 * @returns {string} JSON 字符串
 */
export function serializeData(data) {
  try {
    return JSON.stringify(data)
  } catch (error) {
    console.error('数据序列化失败:', error)
    return null
  }
}

/**
 * 反序列化数据
 * @param {string} serialized - 序列化的 JSON 字符串
 * @param {*} defaultValue - 默认值
 * @returns {*} 反序列化后的数据
 */
export function deserializeData(serialized, defaultValue = null) {
  if (!serialized) {
    return defaultValue
  }

  try {
    return JSON.parse(serialized)
  } catch (error) {
    console.error('数据反序列化失败:', error)
    return defaultValue
  }
}

/**
 * 安全地解析 JSON
 * @param {string} jsonStr - JSON 字符串
 * @param {*} defaultValue - 默认值
 * @returns {*} 解析后的对象或默认值
 */
export function safeJSONParse(jsonStr, defaultValue = null) {
  return deserializeData(jsonStr, defaultValue)
}

/**
 * 从本地存储获取数据
 * @param {string} key - 存储键
 * @param {*} defaultValue - 默认值
 * @returns {*} 存储的数据或默认值
 */
export function getFromStorage(key, defaultValue = null) {
  try {
    const serialized = localStorage.getItem(key)
    return serialized ? deserializeData(serialized, defaultValue) : defaultValue
  } catch (error) {
    console.error(`从本地存储获取数据失败 (${key}):`, error)
    return defaultValue
  }
}

/**
 * 保存数据到本地存储
 * @param {string} key - 存储键
 * @param {*} value - 要存储的值
 * @returns {boolean} 是否成功
 */
export function saveToStorage(key, value) {
  try {
    const serialized = serializeData(value)
    if (serialized !== null) {
      localStorage.setItem(key, serialized)
      return true
    }
    return false
  } catch (error) {
    console.error(`保存数据到本地存储失败 (${key}):`, error)
    return false
  }
}

/**
 * 从本地存储删除数据
 * @param {string} key - 存储键
 * @returns {boolean} 是否成功
 */
export function removeFromStorage(key) {
  try {
    localStorage.removeItem(key)
    return true
  } catch (error) {
    console.error(`从本地存储删除数据失败 (${key}):`, error)
    return false
  }
}

/**
 * 清空本地存储
 * @param {string[]} excludeKeys - 要排除的键列表
 */
export function clearStorage(excludeKeys = []) {
  try {
    const excludedValues = {}
    excludeKeys.forEach(key => {
      excludedValues[key] = getFromStorage(key)
    })

    localStorage.clear()

    // 恢复排除的键
    Object.entries(excludedValues).forEach(([key, value]) => {
      if (value !== null) {
        saveToStorage(key, value)
      }
    })
  } catch (error) {
    console.error('清空本地存储失败:', error)
  }
}

/**
 * 压缩数据（移除 null 和 undefined 值）
 * @param {Object} obj - 要压缩的对象
 * @returns {Object} 压缩后的对象
 */
export function compactObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj
  }

  const result = Array.isArray(obj) ? [] : {}

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key]
      if (value !== null && value !== undefined) {
        result[key] = typeof value === 'object' ? compactObject(value) : value
      }
    }
  }

  return result
}
