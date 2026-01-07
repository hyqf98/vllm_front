/**
 * 全局类型声明
 */

// Electron webview element type declaration
interface HTMLWebViewElement extends HTMLElement {
  src: string
  reload(): void
  getURL(): string
  getTitle(): string
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void
}

declare global {
  interface Window {
    api: ElectronAPI
  }

  // Register webview as a known custom element
  interface HTMLElementTagNameMap {
    webview: HTMLWebViewElement
  }
}

interface ElectronAPI {
  ssh: {
    connect: (config: SSHConfig) => Promise<SSHResult>
    disconnect: (serverId: string) => Promise<SSHResult>
    execCommand: (serverId: string, command: string) => Promise<SSHResult>
    listDirectory: (serverId: string, path: string) => Promise<SSHResult>
    getServerInfo: (serverId: string) => Promise<SSHResult>
    checkEnvironment: (serverId: string, envType: string, envName: string) => Promise<SSHResult>
    getEnvironmentList: (serverId: string, envType: string) => Promise<SSHResult>
    getServerGPUs: (serverId: string) => Promise<SSHResult>
  }
  service: {
    start: (serverId: string, serviceConfig: ServiceConfig) => Promise<SSHResult>
    stop: (serverId: string, pid: number, startCommand: string) => Promise<SSHResult>
    checkStatus: (serverId: string, pid: number) => Promise<SSHResult>
    checkAllStatus: (services: Service[]) => Promise<SSHResult>
  }
  log: {
    read: (serverId: string, logPath: string, lines: number) => Promise<SSHResult>
  }
  framework: {
    upgrade: (serverId: string, upgradeConfig: any) => Promise<SSHResult>
    getVersion: (serverId: string, framework: string, envType: string, envName: string) => Promise<SSHResult>
  }
  data: {
    read: (moduleName: string, defaultValue?: any) => Promise<DataResult>
    write: (moduleName: string, data: any) => Promise<DataResult>
    delete: (moduleName: string) => Promise<DataResult>
    exists: (moduleName: string) => Promise<DataResult>
    list: () => Promise<DataResult>
    clearAll: () => Promise<DataResult>
    getPath: () => Promise<DataResult>
  }
}

interface SSHConfig {
  serverId: string
  host: string
  port?: number
  username: string
  password?: string
  privateKey?: string
}

interface SSHResult {
  success: boolean
  data?: any
  error?: string
  stdout?: string
  stderr?: string
}

interface ServiceConfig {
  name: string
  framework: string
  envType: string
  envName: string
  modelPath: string
  port: string
  logPath: string
  startCommand: string
}

interface Service {
  id: string
  serverId: string
  name: string
  framework: string
  envType: string
  envName: string
  modelPath: string
  port: string
  logPath: string
  startCommand: string
  status: string
  pid?: number
  createdAt?: string
}

interface Server {
  id: string
  name: string
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  description?: string
  status?: string
  createdAt?: string
}

interface DataResult {
  success: boolean
  data?: any
  error?: string
  exists?: boolean
}

export {}
