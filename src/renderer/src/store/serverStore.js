import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 服务器管理 Store
 */
export const useServerStore = defineStore('server', () => {
  // 服务器列表
  const servers = ref([])

  // 当前选中的服务器
  const currentServer = ref(null)

  // 数据模块名称
  const DATA_MODULE = 'servers'

  /**
   * 添加服务器
   * @param {Object} server - 服务器配置
   * @param {string} server.id - 服务器唯一ID
   * @param {string} server.name - 服务器名称
   * @param {string} server.type - 类型: 'ssh' | 'localhost'
   * @param {string} server.osType - 操作系统: 'linux' | 'darwin' | 'windows'
   * @param {string} server.host - 服务器地址 (SSH 类型)
   * @param {number} server.port - SSH端口 (SSH 类型)
   * @param {string} server.username - 用户名 (SSH 类型)
   * @param {string} server.password - 密码 (可选, SSH 类型)
   * @param {string} server.privateKey - 私钥路径 (可选, SSH 类型)
   * @param {string} server.description - 描述
   */
  const addServer = async (server) => {
    const newServer = {
      ...server,
      id: server.id || Date.now().toString(),
      type: server.type || 'ssh',  // 默认为 SSH 类型
      osType: server.osType || 'linux',  // 默认为 Linux
      createdAt: new Date().toISOString(),
      status: server.type === 'localhost' ? 'connected' : 'disconnected'  // localhost 默认已连接
    }
    servers.value.push(newServer)
    await saveServers()
    return newServer
  }

  /**
   * 更新服务器配置
   */
  const updateServer = async (id, updates) => {
    const index = servers.value.findIndex(s => s.id === id)
    if (index !== -1) {
      servers.value[index] = { ...servers.value[index], ...updates }
      await saveServers()
    }
  }

  /**
   * 删除服务器
   */
  const deleteServer = async (id) => {
    const index = servers.value.findIndex(s => s.id === id)
    if (index !== -1) {
      servers.value.splice(index, 1)
      if (currentServer.value?.id === id) {
        currentServer.value = null
      }
      await saveServers()

      // 清理关联的环境（需要延迟导入避免循环依赖）
      try {
        const { useEnvironmentStore } = await import('./environmentStore.js')
        const environmentStore = useEnvironmentStore()
        const relatedEnvironments = environmentStore.getEnvironmentsByServerId(id)

        // 删除所有关联的环境
        for (const env of relatedEnvironments) {
          await environmentStore.deleteEnvironment(env.id)
        }

        if (relatedEnvironments.length > 0) {
          console.log(`已清理 ${relatedEnvironments.length} 个关联环境`)
        }
      } catch (error) {
        console.warn('清理关联环境失败:', error)
      }

      // 清理关联的服务（需要延迟导入避免循环依赖）
      try {
        const { useModelServiceStore } = await import('./modelServiceStore.js')
        const serviceStore = useModelServiceStore()
        const relatedServices = serviceStore.getServicesByServerId(id)

        // 删除所有关联的服务
        for (const service of relatedServices) {
          await serviceStore.deleteService(service.id)
        }

        if (relatedServices.length > 0) {
          console.log(`已清理 ${relatedServices.length} 个关联服务`)
        }
      } catch (error) {
        console.warn('清理关联服务失败:', error)
      }
    }
  }

  /**
   * 设置当前服务器
   */
  const setCurrentServer = (server) => {
    currentServer.value = server
  }

  /**
   * 更新服务器状态
   */
  const updateServerStatus = (id, status) => {
    const server = servers.value.find(s => s.id === id)
    if (server) {
      server.status = status
    }
  }

  /**
   * 保存服务器列表到持久化存储
   */
  const saveServers = async () => {
    try {
      // 将对象转换为可序列化的纯 JSON
      const rawData = servers.value.map(server => ({
        id: server.id,
        name: server.name,
        type: server.type || 'ssh',
        osType: server.osType || 'linux',
        host: server.host,
        port: server.port,
        username: server.username,
        password: server.password || '',
        privateKey: server.privateKey || '',
        description: server.description || '',
        status: server.status,
        createdAt: server.createdAt
      }))

      // 使用 JSON 序列化/反序列化来深拷贝，移除任何不可序列化的数据
      const serializedData = JSON.parse(JSON.stringify(rawData))

      const result = await window.api.data.write(DATA_MODULE, serializedData)

      // 检查写入结果
      if (!result.success) {
        throw new Error(result.error || '写入数据失败')
      }

      console.log(`保存服务器列表成功: ${serializedData.length} 个服务器`)
    } catch (error) {
      console.error('保存服务器列表失败:', error)
      throw error // 重新抛出错误
    }
  }

  /**
   * 从持久化存储加载服务器列表
   */
  const loadServers = async () => {
    try {
      const result = await window.api.data.read(DATA_MODULE, [])

      if (result.success && result.data) {
        const loadedServers = result.data
        // 始终用持久化的数据替换内存中的数据
        // 兼容旧数据：没有 type 字段的默认为 'ssh'，没有 osType 的默认为 'linux'
        servers.value = loadedServers.map(server => ({
          ...server,
          type: server.type || 'ssh',
          osType: server.osType || 'linux',
          status: server.type === 'localhost' ? 'connected' : 'disconnected'
        }))
      }
    } catch (error) {
      console.error('加载服务器列表失败:', error)
    }
  }

  return {
    servers,
    currentServer,
    addServer,
    updateServer,
    deleteServer,
    setCurrentServer,
    updateServerStatus,
    loadServers
  }
})
