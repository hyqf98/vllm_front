# VLLM Front 综合优化方案

## 文档概述

本文档基于对 VLLM Front 项目的全面代码审查和深入架构分析，提供了一套完整的优化方案。方案涵盖基础代码质量优化和高级架构重构，通过成熟的设计模式和最佳实践，显著提升系统的可扩展性、可维护性和健壮性。

**当前项目状态：**
- Electron 37.3.1 + Vue 3.5.17 架构
- 源代码文件：43 个（.js + .vue）
- 主进程代码：~3,700 行（ssh-manager.js 单文件过大）
- 渲染进程代码：~15,400 行
- 总代码行数：约 19,118 行
- 技术栈：Pinia、Element Plus、SSH2

**优化目标：**
1. 提升代码质量和规范性
2. 通过设计模式解耦系统模块
3. 提升命令执行的健壮性和可靠性
4. 建立可配置的命令系统
5. 改善代码的可测试性和可维护性

---

## 一、当前问题分析

### 1.1 架构与设计问题

#### 🔴 高优先级

**问题描述：**
1. **单文件过大**：`ssh-manager.js` 文件达到 3,721 行，违反单一职责原则
2. **职责不清晰**：SSH 管理器同时负责连接管理、命令执行、系统信息获取、GPU 检测等多个职责
3. **紧耦合**：主进程 `index.js` 包含 735 行 IPC 处理器，缺乏模块化
4. **扩展性差**：添加新服务器类型、GPU 类型、环境类型需要修改多处代码

**影响：**
- 代码难以维护和测试
- 修改风险高，容易引入 bug
- 新功能添加困难

#### 🟡 中优先级

**问题描述：**
1. **缺乏分层架构**：业务逻辑直接在 IPC handlers 和 Vue 组件中
2. **状态管理分散**：部分状态在 Store 中，部分在组件本地状态
3. **错误处理不一致**：有些地方返回 `{ success, error }`，有些直接抛出异常

### 1.2 代码质量问题

#### 🔴 高优先级

**问题描述：**
1. **代码重复**：
   - `formatBytes` 函数在多个组件中重复（ServerDetails.vue、ModelServices.vue 等）
   - 数据序列化逻辑在多个 Store 中重复
   ```javascript
   // serverStore.js, environmentStore.js, modelHubStore.js 中都有类似代码
   const rawData = servers.value.map(server => ({...}))
   const serializedData = JSON.parse(JSON.stringify(rawData))
   ```

2. **魔法数字和硬编码**：
   ```javascript
   // GPUProcessManager.vue
   if (gb > 10) return 'memory-high'
   if (gb > 5) return 'memory-medium'

   // api/modelHub.js
   timeout: 15000  // 硬编码超时时间

   // ssh-manager.js
   maxBuffer: 10 * 1024 * 1024  // 硬编码缓冲区大小
   ```

3. **控制台日志过多**：148 处 console 语句，缺乏统一的日志管理

4. **缺乏重试机制**：命令执行失败后直接返回，无重试逻辑

5. **超时固定**：所有命令统一 30 秒超时，无法根据命令类型调整

#### 🟡 中优先级

**问题描述：**
1. **函数复杂度过高**：
   - `findCondaPath()` 函数超过 100 行
   - `getLocalServerInfo()` 函数超过 300 行
   - Vue 组件中的 `setup` 函数过长（如 ModelServices.vue 有 1625 行）

2. **命名不一致**：中英文混用、驼峰和下划线混用

3. **缺乏注释**：部分复杂逻辑缺少 JSDoc 注释

### 1.3 性能问题

#### 🟡 中优先级

**问题描述：**
1. **大量数据渲染**：GPU 进程列表、服务器列表等缺乏虚拟滚动
2. **并发控制缺失**：SSH 连接无连接池，命令执行无并发控制
3. **内存泄漏风险**：SSH 连接、定时器、事件监听器未正确清理

#### 🟢 低优先级

**问题描述：**
1. **缺乏懒加载**：大型组件未实现路由级别的代码分割
2. **无结果缓存**：重复查询相同数据

### 1.4 安全问题

#### 🔴 高优先级

**问题描述：**
1. **敏感数据明文存储**：SSH 密码和私钥以明文形式存储在本地 JSON 文件中
2. **输入验证不足**：缺乏对用户输入的验证和清理
3. **命令注入风险**：SSH 命令执行未充分验证参数

#### 🟡 中优先级

**问题描述：**
1. **缺乏 CSP 策略**：渲染进程缺少内容安全策略

### 1.5 可维护性问题

#### 🔴 高优先级

**问题描述：**
1. **完全缺乏测试**：项目没有任何单元测试、集成测试或 E2E 测试
2. **配置分散**：配置项散落在各个文件中
3. **无错误分类**：错误处理不区分网络错误、权限错误、命令错误等

---

## 二、优化方案

### 第一阶段：基础优化（1-2 周）

#### 2.1.1 代码结构与架构优化

**目标**：拆分超大文件，模块化代码

**拆分 ssh-manager.js（3,721 行 → 模块化）**

```
src/main/ssh-modules/
├── connection-manager.js       # 连接管理（连接、断开、重连）
├── command-executor.js         # 命令执行（本地/远程命令）
├── system-info-service.js      # 系统信息获取
├── gpu-service.js              # GPU 信息获取
├── process-service.js          # 进程管理
└── ssh-manager.js              # 主管理器（协调各模块）
```

**重构主进程 IPC 处理器**

```
src/main/ipc-handlers/
├── index.js                      # 统一导出
├── server-handler.js             # 服务器相关
├── environment-handler.js        # 环境相关
├── service-handler.js            # 服务相关
├── model-handler.js              # 模型相关
└── data-handler.js               # 数据相关
```

#### 2.1.2 创建公共工具函数库

```
src/renderer/src/utils/
├── index.js                      # 统一导出
├── format.js                     # 格式化工具（formatBytes、formatPercent等）
├── validation.js                 # 验证工具（validateServer、isCommandSafe等）
├── storage.js                    # 存储工具（deepClone、serializeData等）
├── constants.js                  # 常量定义（CONFIG、SERVER_TYPES等）
├── logger.js                     # 日志工具
├── error-handler.js              # 错误处理（AppError、ErrorHandler）
└── performance.js                # 性能工具（debounce、throttle）
```

**format.js 实现**：

```javascript
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
```

**constants.js 实现**：

```javascript
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

export const SERVER_TYPES = {
  SSH: 'ssh',
  LOCALHOST: 'localhost'
}

export const GPU_VENDORS = {
  NVIDIA: 'nvidia',
  AMD: 'amd',
  INTEL: 'intel',
  APPLE: 'apple'
}
```

**logger.js 实现**：

```javascript
import { LOG_LEVELS } from './constants.js'

class Logger {
  constructor() {
    this.level = LOG_LEVELS.INFO
    this.logs = []
    this.maxLogs = 1000
  }

  log(level, module, message, data = null) {
    const logEntry = { timestamp: Date.now(), level, module, message, data }
    this.logs.push(logEntry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    const timestamp = new Date().toISOString()
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`

    switch (level) {
      case LOG_LEVELS.ERROR:
        console.error(formattedMessage, data || '')
        break
      case LOG_LEVELS.WARN:
        console.warn(formattedMessage, data || '')
        break
      case LOG_LEVELS.DEBUG:
        console.debug(formattedMessage, data || '')
        break
      default:
        console.log(formattedMessage, data || '')
    }
  }

  info(module, message, data) {
    this.log(LOG_LEVELS.INFO, module, message, data)
  }

  error(module, message, data) {
    this.log(LOG_LEVELS.ERROR, module, message, data)
  }
}

export default new Logger()
```

#### 2.1.3 安全性优化

**密码加密存储**：

```javascript
// src/main/security/crypto.js
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { app } from 'electron'

class CryptoManager {
  constructor() {
    this.algorithm = 'aes-256-gcm'
    this.key = this.deriveKey()
  }

  deriveKey() {
    const machineId = app.getMachineID()
    const salt = Buffer.from('vllm-front-salt')
    return scryptSync(machineId, salt, 32)
  }

  encrypt(text) {
    if (!text) return ''
    const iv = randomBytes(16)
    const cipher = createCipheriv(this.algorithm, this.key, iv)

    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    return {
      data: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    }
  }

  decrypt(encryptedData) {
    if (!encryptedData || !encryptedData.data) return ''

    const decipher = createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(encryptedData.iv, 'hex')
    )

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'))

    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }

  encryptObject(obj, fields = ['password', 'privateKey']) {
    const encrypted = { ...obj }
    fields.forEach(field => {
      if (encrypted[field]) {
        encrypted[field] = this.encrypt(encrypted[field])
      }
    })
    return encrypted
  }

  decryptObject(obj, fields = ['password', 'privateKey']) {
    const decrypted = { ...obj }
    fields.forEach(field => {
      if (decrypted[field]) {
        decrypted[field] = this.decrypt(decrypted[field])
      }
    })
    return decrypted
  }
}

export default new CryptoManager()
```

**输入验证**：

```javascript
// src/renderer/src/utils/validation.js

/**
 * 验证服务器配置
 */
export function validateServer(server) {
  const errors = []

  if (!server.name || server.name.trim() === '') {
    errors.push('服务器名称不能为空')
  }

  if (server.type === 'ssh') {
    if (!server.host || server.host.trim() === '') {
      errors.push('服务器地址不能为空')
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
 */
export function isCommandSafe(command) {
  const dangerousChars = [';', '|', '&', '$', '`', '(', ')', '<', '>']
  for (const char of dangerousChars) {
    if (command.includes(char)) {
      return false
    }
  }
  return true
}
```

#### 2.1.4 性能优化基础

**防抖和节流**：

```javascript
// src/renderer/src/utils/performance.js

export function debounce(func, wait = 300) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

export function throttle(func, limit = 300) {
  let inThrottle
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}
```

**路由懒加载**：

```javascript
// src/renderer/src/router/index.js
const routes = [
  {
    path: '/servers',
    name: 'ServerManagement',
    component: () => import('@renderer/views/servers/ServerManagement.vue')
  },
  {
    path: '/servers/:id',
    name: 'ServerDetails',
    component: () => import('@renderer/views/servers/ServerDetails.vue')
  }
  // ... 其他路由
]
```

---

### 第二阶段：设计模式应用（2-3 周）

#### 2.2.1 策略模式 - 服务器连接类型

**设计目标**：将不同类型的服务器连接方式抽象为统一接口

**类图设计**：

```
┌─────────────────────────┐
│  ConnectionStrategy     │◄────── 抽象策略
├─────────────────────────┤
│ + execute(command)      │
│ + connect()             │
│ + disconnect()          │
└─────────────────────────┘
         △
         ├────────────────┬────────────────┐
         │                │                │
┌─────────────────┐ ┌───────────┐ ┌─────────────┐
│LocalhostStrategy│ │SSHStrategy│ │DockerStrategy│
└─────────────────┘ └───────────┘ └─────────────┘
```

**代码实现**：

```javascript
// src/main/connection/ConnectionStrategy.js
class ConnectionStrategy {
  constructor(serverConfig) {
    if (new.target === ConnectionStrategy) {
      throw new Error('ConnectionStrategy 是抽象类，不能直接实例化')
    }
    this.serverConfig = serverConfig
    this.isConnected = false
  }

  async execute(command, options = {}) {
    throw new Error('子类必须实现 execute 方法')
  }

  async connect() {
    throw new Error('子类必须实现 connect 方法')
  }

  async disconnect() {
    throw new Error('子类必须实现 disconnect 方法')
  }

  checkConnection() {
    return this.isConnected
  }
}

export default ConnectionStrategy
```

```javascript
// src/main/connection/LocalhostStrategy.js
import { exec } from 'child_process'
import { promisify } from 'util'
import ConnectionStrategy from './ConnectionStrategy.js'

const execAsync = promisify(exec)

class LocalhostStrategy extends ConnectionStrategy {
  constructor(serverConfig) {
    super(serverConfig)
    this.isConnected = true
  }

  async execute(command, options = {}) {
    const { timeout = 30000 } = options

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 10 * 1024 * 1024
      })

      return {
        success: true,
        stdout: stdout || '',
        stderr: stderr || '',
        code: 0
      }
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        code: error.code || 1
      }
    }
  }

  async connect() {
    return { success: true, message: '本地宿主机已就绪' }
  }

  async disconnect() {
    return { success: true }
  }
}

export default LocalhostStrategy
```

```javascript
// src/main/connection/SSHStrategy.js
import { Client } from 'ssh2'
import ConnectionStrategy from './ConnectionStrategy.js'

class SSHStrategy extends ConnectionStrategy {
  constructor(serverConfig) {
    super(serverConfig)
    this.client = null
  }

  async connect() {
    const { host, port, username, password, privateKey } = this.serverConfig

    return new Promise((resolve, reject) => {
      this.client = new Client()

      const sshConfig = {
        host,
        port: port || 22,
        username,
        readyTimeout: 30000
      }

      if (password) {
        sshConfig.password = password
      } else if (privateKey) {
        sshConfig.privateKey = privateKey
      }

      this.client.on('ready', () => {
        this.isConnected = true
        resolve({ success: true, message: 'SSH 连接成功' })
      })

      this.client.on('error', (error) => {
        this.isConnected = false
        resolve({ success: false, error: error.message })
      })

      this.client.connect(sshConfig)
    })
  }

  async execute(command, options = {}) {
    if (!this.isConnected || !this.client) {
      return { success: false, error: '未连接到服务器' }
    }

    const { timeout = 30000 } = options

    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let timer = null

      if (timeout > 0) {
        timer = setTimeout(() => {
          resolve({
            success: false,
            stdout,
            stderr: stderr || '命令执行超时',
            code: -1
          })
        }, timeout)
      }

      this.client.exec(command, (error, stream) => {
        if (error) {
          if (timer) clearTimeout(timer)
          resolve({
            success: false,
            stderr: error.message,
            code: -1
          })
          return
        }

        stream.on('data', (data) => {
          stdout += data.toString()
        })

        stream.stderr.on('data', (data) => {
          stderr += data.toString()
        })

        stream.on('close', (code) => {
          if (timer) clearTimeout(timer)
          resolve({
            success: code === 0,
            stdout,
            stderr,
            code
          })
        })
      })
    })
  }

  async disconnect() {
    if (this.client) {
      return new Promise((resolve) => {
        this.client.end()
        this.client.on('close', () => {
          this.isConnected = false
          this.client = null
          resolve({ success: true })
        })
      })
    }
    return { success: true }
  }
}

export default SSHStrategy
```

```javascript
// src/main/connection/ConnectionStrategyFactory.js
import LocalhostStrategy from './LocalhostStrategy.js'
import SSHStrategy from './SSHStrategy.js'

class ConnectionStrategyFactory {
  static STRATEGIES = {
    LOCALHOST: 'localhost',
    SSH: 'ssh',
    DOCKER: 'docker'
  }

  static create(serverConfig) {
    const { type } = serverConfig

    switch (type) {
      case this.STRATEGIES.LOCALHOST:
        return new LocalhostStrategy(serverConfig)

      case this.STRATEGIES.SSH:
        return new SSHStrategy(serverConfig)

      default:
        throw new Error(`未知的服务器类型: ${type}`)
    }
  }
}

export default ConnectionStrategyFactory
```

#### 2.2.2 适配器模式 - 环境管理

**设计目标**：统一不同环境管理工具的接口

**类图设计**：

```
┌─────────────────────────┐
│  EnvironmentAdapter     │◄────── 抽象适配器
├─────────────────────────┤
│ + listEnvironments()    │
│ + createEnvironment()   │
│ + installPackage()      │
│ + executeCommand()      │
└─────────────────────────┘
         △
         ├──────────┬──────────┬──────────┐
         │          │          │          │
┌──────────┐ ┌──────┐ ┌──────┐ ┌──────────┐
│CondaAdapter│ │UVAdapter│ │VenvAdapter│ │DockerAdapter│
└──────────┘ └──────┘ └──────┘ └──────────┘
```

**代码实现**：

```javascript
// src/main/environment/EnvironmentAdapter.js
class EnvironmentAdapter {
  constructor(connectionStrategy) {
    if (new.target === EnvironmentAdapter) {
      throw new Error('EnvironmentAdapter 是抽象类')
    }
    this.connection = connectionStrategy
    this.cache = new Map()
  }

  async listEnvironments() {
    throw new Error('子类必须实现 listEnvironments 方法')
  }

  async createEnvironment(name, pythonVersion) {
    throw new Error('子类必须实现 createEnvironment 方法')
  }

  async installPackage(envName, packageName, version = null) {
    throw new Error('子类必须实现 installPackage 方法')
  }

  clearCache() {
    this.cache.clear()
  }
}

export default EnvironmentAdapter
```

```javascript
// src/main/environment/CondaAdapter.js
import EnvironmentAdapter from './EnvironmentAdapter.js'

class CondaAdapter extends EnvironmentAdapter {
  constructor(connectionStrategy) {
    super(connectionStrategy)
    this.condaPath = null
  }

  async findConda() {
    if (this.condaPath) {
      return this.condaPath
    }

    // 并行检测多种方法
    const methods = [
      // 方法1: 系统路径中
      async () => {
        const result = await this.connection.execute('which conda')
        return result.success && result.stdout.trim() ? result.stdout.trim() : null
      },
      // 方法2: 常见路径
      async () => {
        const paths = [
          '~/anaconda3/bin/conda',
          '~/miniconda3/bin/conda',
          '~/miniforge3/bin/conda',
          '/opt/anaconda3/bin/conda'
        ]

        for (const path of paths) {
          const result = await this.connection.execute(`test -f ${path} && echo "found"`)
          if (result.success && result.stdout.includes('found')) {
            return path
          }
        }
        return null
      }
    ]

    // 并行执行所有方法，返回第一个成功的结果
    const results = await Promise.all(methods.map(m => m()))
    this.condaPath = results.find(r => r !== null) || 'conda'

    return this.condaPath
  }

  async listEnvironments() {
    const conda = await this.findConda()
    const result = await this.connection.execute(`${conda} env list --json`)

    if (!result.success) {
      throw new Error(`获取 Conda 环境列表失败: ${result.stderr}`)
    }

    const data = JSON.parse(result.stdout)
    return data.envs.map(path => ({
      name: path.split('/').pop(),
      path
    }))
  }

  async installPackage(envName, packageName, version = null) {
    const conda = await this.findConda()
    const packageSpec = version ? `${packageName}==${version}` : packageName

    const result = await this.connection.execute(
      `${conda} install -n ${envName} ${packageSpec} -y`
    )

    return {
      success: result.success,
      message: result.success ? '包安装成功' : result.stderr
    }
  }
}

export default CondaAdapter
```

```javascript
// src/main/environment/EnvironmentAdapterFactory.js
import CondaAdapter from './CondaAdapter.js'
import UVAdapter from './UVAdapter.js'

class EnvironmentAdapterFactory {
  static TYPES = {
    CONDA: 'conda',
    UV: 'uv',
    VENV: 'venv'
  }

  static create(type, connection) {
    switch (type) {
      case this.TYPES.CONDA:
        return new CondaAdapter(connection)
      case this.TYPES.UV:
        return new UVAdapter(connection)
      default:
        throw new Error(`未知的环境类型: ${type}`)
    }
  }

  static async autoDetect(connection) {
    // 按优先级检测
    const detectors = [
      async () => {
        try {
          const adapter = new CondaAdapter(connection)
          await adapter.findConda()
          return adapter
        } catch {
          return null
        }
      },
      async () => {
        try {
          const adapter = new UVAdapter(connection)
          await adapter.findUV()
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
}

export default EnvironmentAdapterFactory
```

#### 2.2.3 工厂模式 - GPU 处理器

**设计目标**：支持多厂商 GPU

**代码实现**：

```javascript
// src/main/gpu/BaseGPUHandler.js
class BaseGPUHandler {
  constructor(connection) {
    if (new.target === BaseGPUHandler) {
      throw new Error('BaseGPUHandler 是抽象类')
    }
    this.connection = connection
  }

  getVendorName() {
    throw new Error('子类必须实现 getVendorName 方法')
  }

  async isAvailable(serverId) {
    throw new Error('子类必须实现 isAvailable 方法')
  }

  async getAllProcesses(serverId) {
    throw new Error('子类必须实现 getAllProcesses 方法')
  }
}

export default BaseGPUHandler
```

```javascript
// src/main/gpu/NVIDIAGPUHandler.js
import BaseGPUHandler from './BaseGPUHandler.js'

class NVIDIAGPUHandler extends BaseGPUHandler {
  constructor(connection) {
    super(connection)
    this.command = 'nvidia-smi'
  }

  getVendorName() {
    return 'nvidia'
  }

  async isAvailable(serverId) {
    const result = await this.connection.execute(
      `${this.command} --query-gpu=name --format=csv,noheader`
    )
    return result.success && result.stdout.trim().length > 0
  }

  async getAllProcesses(serverId) {
    const result = await this.connection.execute(
      `${this.command} --query-compute-apps=pid,process_name,used_memory ` +
      `--format=csv,noheader,nounits`
    )

    if (!result.success) {
      throw new Error(`获取 GPU 进程失败: ${result.stderr}`)
    }

    const processes = []
    const lines = result.stdout.trim().split('\n')

    for (const line of lines) {
      if (!line.trim()) continue

      const [pid, name, memory] = line.split(',').map(s => s.trim())

      processes.push({
        pid: parseInt(pid),
        name: name || 'unknown',
        memoryMB: parseInt(memory) || 0,
        gpuType: 'nvidia',
        serverId
      })
    }

    return processes
  }
}

export default NVIDIAGPUHandler
```

```javascript
// src/main/gpu/GPUHandlerFactory.js
import NVIDIAGPUHandler from './NVIDIAGPUHandler.js'
import AMDGPUHandler from './AMDGPUHandler.js'

class GPUHandlerFactory {
  static async create(serverId, connection) {
    const handlers = [
      new NVIDIAGPUHandler(connection),
      new AMDGPUHandler(connection)
    ]

    for (const handler of handlers) {
      if (await handler.isAvailable(serverId)) {
        return handler
      }
    }

    return null
  }
}

export default GPUHandlerFactory
```

---

### 第三阶段：高级特性（2-3 周）

#### 2.3.1 装饰器模式 - 命令执行增强

**设计目标**：通过装饰器为命令执行添加额外功能

**类图设计**：

```
┌─────────────────────────┐
│  CommandExecutor        │◄────── 基础接口
├─────────────────────────┤
│ + execute()             │
└─────────────────────────┘
         △
         │ 装饰
┌─────────────────────────┐
│  RetryDecorator         │
├─────────────────────────┤
│ - maxRetries            │
│ - backoffMultiplier     │
│ + execute()             │
└─────────────────────────┘
         △
         │ 装饰
┌─────────────────────────┐
│  TimeoutDecorator       │
├─────────────────────────┤
│ - timeout               │
│ + execute()             │
└─────────────────────────┘
```

**重试装饰器**：

```javascript
// src/main/command/decorators/RetryDecorator.js
class RetryDecorator {
  constructor(executor, options = {}) {
    this.executor = executor
    this.maxRetries = options.maxRetries || 3
    this.initialDelay = options.initialDelay || 1000
    this.backoffMultiplier = options.backoffMultiplier || 2
  }

  isRetryableError(result) {
    if (result.success) return false

    const retryableErrors = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'TIMEOUT',
      'network',
      'timeout',
      'connection'
    ]

    const errorLower = (result.stderr || result.error || '').toLowerCase()
    return retryableErrors.some(keyword =>
      errorLower.includes(keyword.toLowerCase())
    )
  }

  async execute(command, options = {}) {
    let lastError = null
    let delay = this.initialDelay

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const result = await this.executor.execute(command, options)

      if (result.success || !this.isRetryableError(result)) {
        if (attempt > 0) {
          result.attempts = attempt + 1
          result.retried = true
        }
        return result
      }

      lastError = result

      if (attempt < this.maxRetries) {
        console.log(`重试第 ${attempt + 1}/${this.maxRetries} 次，延迟 ${delay}ms`)
        await this.sleep(delay)
        delay *= this.backoffMultiplier
      }
    }

    return lastError
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export default RetryDecorator
```

**超时装饰器**：

```javascript
// src/main/command/decorators/TimeoutDecorator.js
class TimeoutDecorator {
  constructor(executor, timeout = 30000) {
    this.executor = executor
    this.timeout = timeout
  }

  async execute(command, options = {}) {
    const timeout = options.timeout || this.timeout

    return Promise.race([
      this.executor.execute(command, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('命令执行超时')), timeout)
      )
    ])
  }
}

export default TimeoutDecorator
```

**命令执行器构建器**：

```javascript
// src/main/command/CommandExecutorBuilder.js
import RetryDecorator from './decorators/RetryDecorator.js'
import TimeoutDecorator from './decorators/TimeoutDecorator.js'

class CommandExecutorBuilder {
  constructor(executor) {
    this.executor = executor
    this.decorators = []
  }

  withRetry(options) {
    this.decorators.push(new RetryDecorator(this.executor, options))
    return this
  }

  withTimeout(timeout) {
    this.decorators.push(new TimeoutDecorator(this.executor, timeout))
    return this
  }

  build() {
    let result = this.executor

    // 按相反顺序应用装饰器
    for (let i = this.decorators.length - 1; i >= 0; i--) {
      result = this.decorators[i]
    }

    return result
  }
}

export default CommandExecutorBuilder
```

#### 2.3.2 观察者模式 - 错误监控

**设计目标**：统一错误监控和上报

**代码实现**：

```javascript
// src/main/error/ErrorPublisher.js
class ErrorPublisher {
  constructor() {
    this.subscribers = []
  }

  subscribe(subscriber) {
    this.subscribers.push(subscriber)
  }

  unsubscribe(subscriber) {
    const index = this.subscribers.indexOf(subscriber)
    if (index > -1) {
      this.subscribers.splice(index, 1)
    }
  }

  publish(error) {
    this.subscribers.forEach(subscriber => {
      try {
        subscriber.onError(error)
      } catch (e) {
        console.error('订阅者处理错误失败:', e)
      }
    })
  }
}

export default ErrorPublisher
```

```javascript
// src/main/error/ErrorClassifier.js
class ErrorClassifier {
  classify(error) {
    if (!error) return 'unknown'

    const message = (error.message || error.stderr || '').toLowerCase()

    if (message.includes('econnrefused') || message.includes('connection refused')) {
      return 'connection_refused'
    }
    if (message.includes('etimedout') || message.includes('timeout')) {
      return 'timeout'
    }
    if (message.includes('permission denied') || message.includes('eacces')) {
      return 'permission_denied'
    }
    if (message.includes('command not found') || message.includes('enoent')) {
      return 'command_not_found'
    }
    if (message.includes('network') || message.includes('econnreset')) {
      return 'network_error'
    }

    return 'unknown'
  }

  isRetryable(error) {
    const type = this.classify(error)
    const retryableTypes = ['timeout', 'network_error', 'connection_refused']
    return retryableTypes.includes(type)
  }
}

export default ErrorClassifier
```

#### 2.3.3 并发控制 - SSH 连接池

**代码实现**：

```javascript
// src/main/connection/SSHConnectionPool.js
class SSHConnectionPool {
  constructor(config = {}) {
    this.maxSize = config.maxSize || 10
    this.idleTimeout = config.idleTimeout || 30000
    this.pool = new Map()
    this.activeCount = 0
  }

  async acquire(serverConfig) {
    const key = this.getConnectionKey(serverConfig)

    // 检查是否有空闲连接
    if (this.pool.has(key)) {
      const connection = this.pool.get(key)
      this.pool.delete(key)
      this.activeCount++
      return connection
    }

    // 创建新连接
    this.activeCount++
    return await this.createConnection(serverConfig)
  }

  release(serverConfig, connection) {
    const key = this.getConnectionKey(serverConfig)
    this.activeCount--

    if (connection.isConnected) {
      // 如果连接池未满，放入池中
      if (this.pool.size < this.maxSize) {
        this.pool.set(key, connection)

        // 设置空闲超时
        setTimeout(() => {
          if (this.pool.has(key)) {
            connection.disconnect()
            this.pool.delete(key)
          }
        }, this.idleTimeout)
      } else {
        connection.disconnect()
      }
    }
  }

  getConnectionKey(serverConfig) {
    return `${serverConfig.host}:${serverConfig.port}@${serverConfig.username}`
  }

  async createConnection(serverConfig) {
    const strategy = ConnectionStrategyFactory.create(serverConfig)
    await strategy.connect()
    return strategy
  }

  getStats() {
    return {
      poolSize: this.pool.size,
      activeCount: this.activeCount,
      totalConnections: this.pool.size + this.activeCount
    }
  }
}

export default SSHConnectionPool
```

#### 2.3.4 配置化命令系统

**命令模板配置**：

```javascript
// src/main/command/templates/CommandTemplates.js
const CommandTemplates = {
  gpu: {
    nvidia: {
      query: {
        template: 'nvidia-smi --query-gpu={{fields}} --format=csv,noheader,nounits',
        fields: 'name,memory.total,memory.used,utilization.gpu'
      },
      processes: {
        template: 'nvidia-smi --query-compute-apps={{fields}} --format=csv,noheader,nounits',
        fields: 'pid,process_name,used_memory'
      }
    },
    amd: {
      query: {
        template: 'rocm-smi --showproductname --showmem --showuse --csv'
      }
    }
  },

  environment: {
    conda: {
      list: {
        template: 'conda env list --json'
      },
      install: {
        template: 'conda install -n {{env}} {{package}} -y'
      }
    }
  }
}

export default CommandTemplates
```

**命令模板引擎**：

```javascript
// src/main/command/CommandTemplateEngine.js
class CommandTemplateEngine {
  static render(template, variables = {}) {
    let result = template

    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`{{${key}}}`, 'g')
      result = result.replace(pattern, value)
    }

    return result
  }

  static getCommand(category, type, action, variables = {}) {
    const template = CommandTemplates[category]?.[type]?.[action]
    if (!template) {
      throw new Error(`未找到命令模板: ${category}.${type}.${action}`)
    }

    return this.render(template.template || template, variables)
  }
}

export default CommandTemplateEngine
```

**版本适配器**：

```javascript
// src/main/command/VersionAdapter.js
class VersionAdapter {
  static adaptCommand(tool, command, version) {
    const adapters = {
      nvidia: {
        smi: {
          legacy: { versionRange: '<400', adapt: (cmd) => cmd },
          modern: { versionRange: '>=400', adapt: (cmd) => cmd }
        }
      },
      conda: {
        cli: {
          legacy: { versionRange: '<4.6', adapt: (cmd) => cmd },
          modern: { versionRange: '>=4.6', adapt: (cmd) => cmd }
        }
      }
    }

    const toolAdapters = adapters[tool]
    if (!toolAdapters) return command

    for (const [name, config] of Object.entries(toolAdapters)) {
      if (this.satisfiesVersion(version, config.versionRange)) {
        return config.adapt(command)
      }
    }

    return command
  }

  static satisfiesVersion(version, range) {
    if (!version) return false

    const [major, minor] = version.split('.').map(Number)

    if (range.startsWith('>=')) {
      const required = parseInt(range.substring(2))
      return major >= required
    }

    if (range.startsWith('<')) {
      const required = parseInt(range.substring(1))
      return major < required
    }

    return false
  }
}

export default VersionAdapter
```

---

## 三、实施计划

### 3.1 第一阶段（1-2 周）：基础增强

**目标**：提升现有代码的健壮性和可靠性

**任务列表**：

**Week 1:**
1. **创建公共工具函数库**（2 天）
   - 实现 format.js、constants.js、validation.js
   - 实现 logger.js、error-handler.js
   - 实现性能工具（debounce、throttle）

2. **拆分 ssh-manager.js**（2 天）
   - 创建 ConnectionManager
   - 创建 CommandExecutor
   - 创建 SystemInfoService

3. **密码加密存储**（1 天）
   - 实现 CryptoManager
   - 迁移现有数据

**Week 2:**
1. **重构 IPC 处理器**（2 天）
   - 模块化 IPC handlers
   - 更新主进程 index.js

2. **输入验证**（1 天）
   - 实现 validateServer
   - 实现 isCommandSafe

3. **路由懒加载**（1 天）
   - 更新路由配置
   - 验证加载效果

4. **代码风格统一**（1 天）
   - 配置 ESLint
   - 配置 Prettier
   - 添加 Git Hooks

**验收标准**：
- 所有魔法数字被常量替换
- 代码重复率降低 60%
- 密码加密存储
- 所有路由懒加载

### 3.2 第二阶段（2-3 周）：设计模式

**目标**：应用设计模式解耦系统模块

**任务列表**：

**Week 3-4:**
1. **实现策略模式**（5 天）
   - 创建 ConnectionStrategy 抽象类
   - 实现 LocalhostStrategy
   - 实现 SSHStrategy
   - 实现 ConnectionStrategyFactory
   - 迁移现有代码

2. **实现适配器模式**（5 天）
   - 创建 EnvironmentAdapter 抽象类
   - 实现 CondaAdapter
   - 实现 UVAdapter
   - 实现 EnvironmentAdapterFactory
   - 迁移环境管理代码

**Week 5:**
1. **实现工厂模式**（3 天）
   - 创建 BaseGPUHandler 抽象类
   - 实现 NVIDIAGPUHandler
   - 实现 AMDGPUHandler（基础版）
   - 实现 GPUHandlerFactory

2. **编写测试**（2 天）
   - 策略模式测试
   - 适配器模式测试
   - 工厂模式测试

**验收标准**：
- ssh-manager.js 文件大小减少 50%
- 所有服务器连接使用策略模式
- 所有环境管理使用适配器模式
- 测试覆盖率 > 60%

### 3.3 第三阶段（2-3 周）：高级特性

**目标**：实现高级特性，完善系统

**任务列表**：

**Week 6-7:**
1. **实现装饰器模式**（5 天）
   - 实现 RetryDecorator
   - 实现 TimeoutDecorator
   - 实现 CommandExecutorBuilder
   - 集成到所有命令执行

2. **实现观察者模式**（3 天）
   - 创建 ErrorPublisher
   - 实现 ErrorClassifier
   - 实现 ErrorLogger
   - 集成到所有模块

3. **SSH 连接池**（2 天）
   - 实现 SSHConnectionPool
   - 实现连接复用
   - 实现连接清理

**Week 8:**
1. **命令配置化**（3 天）
   - 实现 CommandTemplates
   - 实现 CommandTemplateEngine
   - 实现版本检测和适配
   - 迁移所有硬编码命令

2. **完善测试**（2 天）
   - 装饰器模式测试
   - 观察者模式测试
   - 命令配置化测试

**验收标准**：
- 所有命令执行使用装饰器增强
- 所有错误发布到错误发布器
- SSH 连接复用率 > 80%
- 所有命令配置化，无硬编码

---

## 四、预期收益

### 4.1 代码质量提升

| 指标 | 当前 | 优化后 |
|------|------|--------|
| 单文件最大行数 | 3,721 | < 500 |
| 代码重复率 | 高 | < 5% |
| 测试覆盖率 | 0% | > 60% |
| 函数平均复杂度 | 高 | < 15 |

### 4.2 开发效率提升

- **开发速度**：清晰的模块划分，新功能开发速度提升 30%
- **调试效率**：统一的错误处理和日志，问题定位速度提升 50%
- **协作效率**：统一的代码风格，团队协作效率提升 20%

### 4.3 应用性能提升

- **启动速度**：通过代码分割，应用启动速度提升 20%
- **运行性能**：虚拟滚动和性能优化，大数据场景下性能提升 50%
- **内存占用**：修复内存泄漏，内存占用降低 30%

### 4.4 系统稳定性提升

- **命令成功率**：重试机制和错误处理，命令成功率从 ~70% 提升到 > 95%
- **故障恢复**：自动重试，平均故障恢复时间 < 10 秒
- **扩展性**：设计模式应用，添加新功能时间减少 40%

### 4.5 安全性提升

- **数据安全**：敏感数据加密存储
- **防护能力**：输入验证和命令注入防护，安全漏洞减少 80%

---

## 五、风险评估与应对

### 5.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 重构引入新 Bug | 高 | 中 | 建立测试体系，分阶段重构 |
| 性能优化效果不佳 | 中 | 低 | 性能测试对比，保留回退方案 |
| 密码加密兼容性问题 | 中 | 中 | 提供数据迁移方案 |
| 设计模式过度设计 | 中 | 中 | 根据实际需求选择合适的模式 |

### 5.2 时间风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 重构时间超出预期 | 中 | 中 | 分阶段实施，优先高价值任务 |
| 测试覆盖不足 | 高 | 低 | 并行开发测试，逐步提高覆盖率 |

### 5.3 人员风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 团队成员不熟悉设计模式 | 中 | 中 | 提供培训和文档 |
| 代码风格不一致 | 低 | 中 | 强制使用 Git Hooks |

---

## 六、检查清单

### 6.1 基础优化

- [ ] 创建 `src/renderer/src/utils/` 工具函数库
- [ ] 创建 `src/main/ssh-modules/` 模块化 SSH 管理器
- [ ] 创建 `src/main/ipc-handlers/` IPC 处理器模块
- [ ] 消除所有代码重复
- [ ] 替换所有魔法数字为常量
- [ ] 实现密码加密存储
- [ ] 添加输入验证
- [ ] 实现路由懒加载
- [ ] 配置 ESLint 和 Prettier

### 6.2 设计模式

- [ ] 实现策略模式（服务器连接）
- [ ] 实现适配器模式（环境管理）
- [ ] 实现工厂模式（GPU 处理器）
- [ ] 实现装饰器模式（命令增强）
- [ ] 实现观察者模式（错误监控）

### 6.3 高级特性

- [ ] 实现重试装饰器
- [ ] 实现超时装饰器
- [ ] 实现 SSH 连接池
- [ ] 实现命令模板系统
- [ ] 实现版本适配器

### 6.4 测试与文档

- [ ] 建立测试体系
- [ ] 编写单元测试（目标覆盖率 60%+）
- [ ] 编写集成测试
- [ ] 添加 JSDoc 注释
- [ ] 编写 API 文档

---

## 七、附录

### 7.1 参考资料

1. **设计模式**
   - 《设计模式：可复用面向对象软件的基础》
   - 《重构：改善既有代码的设计》

2. **Electron 最佳实践**
   - Electron 官方文档
   - Electron 安全指南

3. **Node.js 最佳实践**
   - Node.js 最佳实践指南
   - 异步编程模式

### 7.2 工具推荐

1. **测试框架**
   - Vitest：单元测试
   - Playwright：E2E 测试

2. **代码质量**
   - ESLint：代码检查
   - Prettier：代码格式化
   - SonarQube：代码质量分析

3. **文档生成**
   - JSDoc：API 文档

### 7.3 命名规范

1. **文件命名**
   - 类文件：PascalCase（如 `SSHManager.js`）
   - 工具文件：camelCase（如 `connectionUtils.js`）
   - 常量文件：UPPER_SNAKE_CASE（如 `ERROR_TYPES.js`）

2. **变量命名**
   - 类名：PascalCase（如 `ConnectionStrategy`）
   - 函数名：camelCase（如 `executeCommand`）
   - 常量：UPPER_SNAKE_CASE（如 `MAX_RETRIES`）
   - 私有成员：_camelCase（如 `_parseVersion`）

---

**文档版本**: 2.0
**最后更新**: 2026-01-27
**作者**: 架构优化团队
