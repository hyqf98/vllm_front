/**
 * 性能优化工具函数
 */

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @param {boolean} immediate - 是否立即执行
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait = 300, immediate = false) {
  let timeout

  return function executedFunction(...args) {
    const later = () => {
      timeout = null
      if (!immediate) func.apply(this, args)
    }

    const callNow = immediate && !timeout

    clearTimeout(timeout)
    timeout = setTimeout(later, wait)

    if (callNow) func.apply(this, args)
  }
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 限制时间（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, limit = 300) {
  let inThrottle

  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

/**
 * 请求动画帧节流
 * @param {Function} func - 要节流的函数
 * @returns {Function} 节流后的函数
 */
export function rafThrottle(func) {
  let rafId = null

  return function executedFunction(...args) {
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        func.apply(this, args)
        rafId = null
      })
    }
  }
}

/**
 * 延迟执行
 * @param {number} ms - 延迟时间（毫秒）
 * @returns {Promise} Promise 对象
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 批处理函数
 * @param {Function} func - 要执行的函数
 * @param {number} batchSize - 批次大小
 * @param {number} delayMs - 批次间延迟（毫秒）
 * @returns {Function} 批处理后的函数
 */
export function batch(func, batchSize = 10, delayMs = 0) {
  let queue = []
  let timer = null

  return async function addItem(...args) {
    queue.push(args)

    if (queue.length >= batchSize) {
      flush()
    } else if (!timer) {
      timer = setTimeout(flush, delayMs)
    }
  }

  async function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }

    if (queue.length === 0) return

    const items = queue.splice(0, batchSize)

    try {
      await func(items)
    } catch (error) {
      console.error('批处理执行失败:', error)
    }

    // 如果还有待处理项，继续处理
    if (queue.length > 0) {
      setTimeout(flush, delayMs)
    }
  }
}

/**
 * 记忆化函数
 * @param {Function} func - 要记忆化的函数
 * @param {Function} keyGenerator - 键生成函数
 * @returns {Function} 记忆化后的函数
 */
export function memoize(func, keyGenerator = null) {
  const cache = new Map()

  return function executedFunction(...args) {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args)

    if (cache.has(key)) {
      return cache.get(key)
    }

    const result = func.apply(this, args)
    cache.set(key, result)

    return result
  }
}

/**
 * 一次性函数（只执行一次）
 * @param {Function} func - 要执行的函数
 * @returns {Function} 一次性函数
 */
export function once(func) {
  let executed = false
  let result

  return function executedFunction(...args) {
    if (!executed) {
      executed = true
      result = func.apply(this, args)
    }

    return result
  }
}

/**
 * 性能测量器
 */
export class PerformanceMonitor {
  constructor() {
    this.marks = new Map()
  }

  /**
   * 开始标记
   * @param {string} name - 标记名称
   */
  mark(name) {
    this.marks.set(name, performance.now())
  }

  /**
   * 测量时间
   * @param {string} name - 标记名称
   * @returns {number} 经过的时间（毫秒）
   */
  measure(name) {
    const start = this.marks.get(name)
    if (!start) {
      console.warn(`标记 "${name}" 不存在`)
      return 0
    }

    const duration = performance.now() - start
    this.marks.delete(name)

    return duration
  }

  /**
   * 测量异步函数执行时间
   * @param {Function} func - 异步函数
   * @param {string} label - 标签
   * @returns {Promise} 函数执行结果
   */
  async measureAsync(func, label = 'async') {
    const start = performance.now()
    try {
      const result = await func()
      const duration = performance.now() - start
      console.log(`[${label}] 执行时间: ${duration.toFixed(2)}ms`)
      return result
    } catch (error) {
      const duration = performance.now() - start
      console.error(`[${label}] 执行失败 (${duration.toFixed(2)}ms):`, error)
      throw error
    }
  }

  /**
   * 清除所有标记
   */
  clear() {
    this.marks.clear()
  }
}
