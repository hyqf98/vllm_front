/**
 * 格式化工具函数
 */

/**
 * 格式化字节数
 * @param {number} bytes - 字节数
 * @param {number} decimals - 保留小数位数，默认 2
 * @returns {string} 格式化后的字符串
 */
export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * 格式化百分比
 * @param {number} value - 数值
 * @param {number} total - 总数
 * @param {number} decimals - 保留小数位数，默认 1
 * @returns {string} 格式化后的百分比字符串
 */
export function formatPercent(value, total, decimals = 1) {
  if (!total || total === 0) return '0%'
  const percent = (value / total) * 100
  return percent.toFixed(decimals) + '%'
}

/**
 * 格式化频率
 * @param {number} ghz - 频率（GHz）
 * @param {number} decimals - 保留小数位数，默认 2
 * @returns {string} 格式化后的频率字符串
 */
export function formatFrequency(ghz, decimals = 2) {
  if (!ghz) return 'Unknown'
  return ghz.toFixed(decimals) + ' GHz'
}

/**
 * 格式化时间戳
 * @param {number} timestamp - 时间戳（毫秒）
 * @param {string} format - 格式类型 'full' | 'date' | 'time' | 'relative'
 * @returns {string} 格式化后的时间字符串
 */
export function formatTime(timestamp, format = 'full') {
  if (!timestamp) return 'Unknown'

  const date = new Date(timestamp)

  switch (format) {
    case 'date':
      return date.toLocaleDateString()
    case 'time':
      return date.toLocaleTimeString()
    case 'relative':
      return formatRelativeTime(timestamp)
    case 'full':
    default:
      return date.toLocaleString()
  }
}

/**
 * 格式化相对时间
 * @param {number} timestamp - 时间戳（毫秒）
 * @returns {string} 相对时间字符串
 */
function formatRelativeTime(timestamp) {
  const now = Date.now()
  const diff = now - timestamp

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`

  return new Date(timestamp).toLocaleDateString()
}

/**
 * 格式化持续时间
 * @param {number} ms - 持续时间（毫秒）
 * @returns {string} 格式化后的持续时间字符串
 */
export function formatDuration(ms) {
  if (!ms || ms < 0) return '0s'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

/**
 * 格式化数字（添加千位分隔符）
 * @param {number} num - 数字
 * @returns {string} 格式化后的数字字符串
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return '0'
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
