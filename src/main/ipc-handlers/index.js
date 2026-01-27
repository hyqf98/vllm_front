/**
 * IPC 处理器统一导出
 * 用于模块化注册所有 IPC 处理器
 */

import { registerServerHandlers } from './server-handler.js'
import { registerEnvironmentHandlers } from './environment-handler.js'
import { registerServiceHandlers } from './service-handler.js'
import { registerModelHandlers } from './model-handler.js'
import { registerDataHandlers } from './data-handler.js'
import { registerFileHandlers } from './file-handler.js'
import { registerGPUHandlers } from './gpu-handler.js'
import { registerDataSourceHandlers } from './datasource-handler.js'

/**
 * 注册所有 IPC 处理器
 */
export function setupIPCHandlers() {
  registerServerHandlers()
  registerEnvironmentHandlers()
  registerServiceHandlers()
  registerModelHandlers()
  registerDataHandlers()
  registerFileHandlers()
  registerGPUHandlers()
  registerDataSourceHandlers()
}

export {
  registerServerHandlers,
  registerEnvironmentHandlers,
  registerServiceHandlers,
  registerModelHandlers,
  registerDataHandlers,
  registerFileHandlers,
  registerGPUHandlers,
  registerDataSourceHandlers
}
