/**
 * 全局常量定义
 */

// 日志级别
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
}

// 命令执行配置
export const CONFIG = {
  // 命令执行配置
  COMMAND: {
    MAX_BUFFER: 10 * 1024 * 1024, // 10MB
    TIMEOUT: 30000, // 30秒
    RETRY_COUNT: 3,
    RETRY_DELAY: 1000
  },

  // GPU 配置
  GPU: {
    MEMORY_HIGH_THRESHOLD: 10, // GB
    MEMORY_MEDIUM_THRESHOLD: 5, // GB
    PROCESS_REFRESH_INTERVAL: 5000, // 5秒
  },

  // API 配置
  API: {
    TIMEOUT: 15000, // 15秒
    RETRY_COUNT: 2
  }
}

// 服务器类型
export const SERVER_TYPES = {
  SSH: 'ssh',
  LOCALHOST: 'localhost'
}

// GPU 厂商
export const GPU_VENDORS = {
  NVIDIA: 'nvidia',
  AMD: 'amd',
  INTEL: 'intel',
  APPLE: 'apple'
}

// 操作系统类型
export const OS_TYPES = {
  LINUX: 'linux',
  WINDOWS: 'windows',
  DARWIN: 'darwin'
}

// 环境管理工具类型
export const ENV_TYPES = {
  CONDA: 'conda',
  UV: 'uv',
  VENV: 'venv'
}

// 错误类型
export const ERROR_TYPES = {
  NETWORK: 'network_error',
  TIMEOUT: 'timeout',
  PERMISSION_DENIED: 'permission_denied',
  COMMAND_NOT_FOUND: 'command_not_found',
  CONNECTION_REFUSED: 'connection_refused',
  UNKNOWN: 'unknown'
}
