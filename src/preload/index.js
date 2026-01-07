import { contextBridge, ipcRenderer } from 'electron'

// SSH API
const sshAPI = {
  connect: (config) => ipcRenderer.invoke('ssh:connect', config),
  disconnect: (serverId) => ipcRenderer.invoke('ssh:disconnect', serverId),
  execCommand: (serverId, command) => ipcRenderer.invoke('ssh:execCommand', serverId, command),
  execCommandStream: (serverId, command, taskId) =>
    ipcRenderer.invoke('ssh:execCommandStream', serverId, command, taskId),
  listDirectory: (serverId, path) => ipcRenderer.invoke('ssh:listDirectory', serverId, path),
  getServerInfo: (serverId) => ipcRenderer.invoke('ssh:getServerInfo', serverId),
  checkEnvironment: (serverId, envType, envName) =>
    ipcRenderer.invoke('ssh:checkEnvironment', serverId, envType, envName),
  getEnvironmentList: (serverId, envType) =>
    ipcRenderer.invoke('ssh:getEnvironmentList', serverId, envType),
  detectEnvironments: (serverId) =>
    ipcRenderer.invoke('ssh:detectEnvironments', serverId),
  getCondaEnvironments: (serverId, condaPath) =>
    ipcRenderer.invoke('ssh:getCondaEnvironments', serverId, condaPath),
  getServerGPUs: (serverId) => ipcRenderer.invoke('ssh:getServerGPUs', serverId)
}

// 服务管理API
const serviceAPI = {
  start: (serverId, serviceConfig) => ipcRenderer.invoke('service:start', serverId, serviceConfig),
  stop: (serverId, pid, startCommand) => ipcRenderer.invoke('service:stop', serverId, pid, startCommand),
  checkStatus: (serverId, pid) => ipcRenderer.invoke('service:checkStatus', serverId, pid),
  checkAllStatus: (services) => ipcRenderer.invoke('service:checkAllStatus', services)
}

// 日志管理API
const logAPI = {
  read: (serverId, logPath, lines) => ipcRenderer.invoke('log:read', serverId, logPath, lines)
}

// 框架升级API
const frameworkAPI = {
  upgrade: (serverId, upgradeConfig) => ipcRenderer.invoke('framework:upgrade', serverId, upgradeConfig),
  getVersion: (serverId, framework, envType, envName) =>
    ipcRenderer.invoke('framework:getVersion', serverId, framework, envType, envName)
}

// 数据持久化API
const dataAPI = {
  read: (moduleName, defaultValue) => ipcRenderer.invoke('data:read', moduleName, defaultValue),
  write: (moduleName, data) => ipcRenderer.invoke('data:write', moduleName, data),
  delete: (moduleName) => ipcRenderer.invoke('data:delete', moduleName),
  exists: (moduleName) => ipcRenderer.invoke('data:exists', moduleName),
  list: () => ipcRenderer.invoke('data:list'),
  clearAll: () => ipcRenderer.invoke('data:clearAll'),
  getPath: () => ipcRenderer.invoke('data:getPath')
}

// 模型市场API
const modelHubAPI = {
  getModels: (platform, params) => ipcRenderer.invoke('modelHub:getModels', platform, params),
  checkCommand: (serverId, envType, envName, command) =>
    ipcRenderer.invoke('modelHub:checkCommand', serverId, envType, envName, command),
  startDownload: (downloadConfig) => ipcRenderer.invoke('modelHub:startDownload', downloadConfig),
  cancelDownload: (serverId, modelId) => ipcRenderer.invoke('modelHub:cancelDownload', serverId, modelId)
}

// 模型测试API
const modelTestAPI = {
  testConnection: (protocol, serverUrl, apiKey, model) =>
    ipcRenderer.invoke('modelTest:testConnection', protocol, serverUrl, apiKey, model),
  listModels: (protocol, serverUrl, apiKey) =>
    ipcRenderer.invoke('modelTest:listModels', protocol, serverUrl, apiKey),
  chat: (protocol, serverUrl, apiKey, model, messages, params) =>
    ipcRenderer.invoke('modelTest:chat', protocol, serverUrl, apiKey, model, messages, params)
}

// 数据源管理API
const datasourceAPI = {
  getConda: (serverId, envType, envName) =>
    ipcRenderer.invoke('datasource:getConda', serverId, envType, envName),
  setConda: (serverId, channels) =>
    ipcRenderer.invoke('datasource:setConda', serverId, channels),
  getPip: (serverId, envType, envName) =>
    ipcRenderer.invoke('datasource:getPip', serverId, envType, envName),
  setPip: (serverId, indexUrl, extraIndexUrls) =>
    ipcRenderer.invoke('datasource:setPip', serverId, indexUrl, extraIndexUrls),
  restoreDefault: (serverId, sourceType) =>
    ipcRenderer.invoke('datasource:restoreDefault', serverId, sourceType),
  testSpeed: (serverId, url) =>
    ipcRenderer.invoke('datasource:testSpeed', serverId, url)
}

contextBridge.exposeInMainWorld('api', {
  ssh: sshAPI,
  service: serviceAPI,
  log: logAPI,
  framework: frameworkAPI,
  data: dataAPI,
  modelHub: modelHubAPI,
  modelTest: modelTestAPI,
  datasource: datasourceAPI
})

// 暴露 electron 对象用于事件监听（主要用于下载进度和模型测试流式输出）
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on: (channel, func) => {
      const validChannels = ['download:progress:', 'download:log:', 'modelTest:chunk', 'ssh:stream:data', 'ssh:stream:close']
      if (validChannels.some(vc => channel.startsWith(vc))) {
        // 修复：需要同时传递 event 和 args
        ipcRenderer.on(channel, (event, ...args) => func(event, ...args))
      }
    },
    removeListener: (channel, func) => {
      const validChannels = ['download:progress:', 'download:log:', 'modelTest:chunk', 'ssh:stream:data', 'ssh:stream:close']
      if (validChannels.some(vc => channel.startsWith(vc))) {
        ipcRenderer.removeListener(channel, func)
      }
    }
  }
})

