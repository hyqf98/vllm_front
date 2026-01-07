import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 模型服务管理 Store
 */
export const useModelServiceStore = defineStore('modelService', () => {
  // 模型服务列表
  const services = ref([])

  // 当前选中的服务
  const currentService = ref(null)

  // 数据模块名称
  const DATA_MODULE = 'services'

  /**
   * 添加模型服务
   * @param {Object} service - 服务配置
   * @param {string} service.id - 服务唯一ID
   * @param {string} service.serverId - 所属服务器ID
   * @param {string} service.name - 服务名称
   * @param {string} service.envType - 环境类型 (conda | uv)
   * @param {string} service.envName - 环境名称
   * @param {string} service.modelPath - 模型路径
   * @param {string} service.startCommand - 启动命令
   * @param {string} service.logPath - 日志路径
   * @param {string} service.port - 服务端口
   */
  const addService = async (service) => {
    const newService = {
      ...service,
      id: service.id || Date.now().toString(),
      createdAt: new Date().toISOString(),
      status: 'stopped', // stopped, starting, running, stopping, error
      pid: null
    }
    services.value.push(newService)
    await saveServices()
    return newService
  }

  /**
   * 更新服务配置
   */
  const updateService = async (id, updates) => {
    const index = services.value.findIndex(s => s.id === id)
    if (index !== -1) {
      services.value[index] = { ...services.value[index], ...updates }
      await saveServices()
    }
  }

  /**
   * 删除服务
   */
  const deleteService = async (id) => {
    const index = services.value.findIndex(s => s.id === id)
    if (index !== -1) {
      services.value.splice(index, 1)
      if (currentService.value?.id === id) {
        currentService.value = null
      }
      await saveServices()
    }
  }

  /**
   * 设置当前服务
   */
  const setCurrentService = (service) => {
    currentService.value = service
  }

  /**
   * 更新服务状态
   */
  const updateServiceStatus = (id, status, pid = null) => {
    const service = services.value.find(s => s.id === id)
    if (service) {
      service.status = status
      if (pid !== null) {
        service.pid = pid
      }
      // 状态变化时保存
      saveServices()
    }
  }

  /**
   * 根据服务器ID获取服务列表
   */
  const getServicesByServerId = (serverId) => {
    return services.value.filter(s => s.serverId === serverId)
  }

  /**
   * 保存服务列表到持久化存储
   */
  const saveServices = async () => {
    try {
      // 将对象转换为可序列化的纯 JSON
      const rawData = services.value.map(service => ({
        id: service.id,
        serverId: service.serverId,
        environmentId: service.environmentId,
        name: service.name,
        framework: service.framework,
        envType: service.envType,
        envName: service.envName,
        modelPath: service.modelPath,
        modelName: service.modelName || '',  // 新增：模型名称
        port: service.port,
        logPath: service.logPath,
        startCommand: service.startCommand,
        status: service.status,
        pid: service.pid,
        createdAt: service.createdAt,
        gpuIds: service.gpuIds || []
      }))

      // 使用 JSON 序列化/反序列化来深拷贝，移除任何不可序列化的数据
      const serializedData = JSON.parse(JSON.stringify(rawData))

      const result = await window.api.data.write(DATA_MODULE, serializedData)

      // 检查写入结果
      if (!result.success) {
        throw new Error(result.error || '写入数据失败')
      }

      console.log(`保存服务列表成功: ${serializedData.length} 个服务`)
    } catch (error) {
      console.error('保存服务列表失败:', error)
      throw error // 重新抛出错误，让调用者知道失败
    }
  }

  /**
   * 从持久化存储加载服务列表（保留缓存的状态）
   */
  const loadServices = async () => {
    try {
      const result = await window.api.data.read(DATA_MODULE, [])

      if (result.success && result.data) {
        // 直接加载持久化的数据，保留缓存的状态和 pid
        // 不再重置为 stopped，让缓存的状态生效
        services.value = result.data.map(service => ({
          ...service,
          status: service.status || 'stopped',
          pid: service.pid || null
        }))
      }
    } catch (error) {
      console.error('加载服务列表失败:', error)
    }
  }

  /**
   * 从持久化存储加载服务列表（重置所有状态为已停止）
   * 用于需要强制刷新状态的场景
   */
  const loadServicesWithResetStatus = async () => {
    try {
      const result = await window.api.data.read(DATA_MODULE, [])

      if (result.success && result.data) {
        // 重置所有服务的状态为已停止
        services.value = result.data.map(service => ({
          ...service,
          status: 'stopped',
          pid: null
        }))
      }
    } catch (error) {
      console.error('加载服务列表失败:', error)
    }
  }

  return {
    services,
    currentService,
    addService,
    updateService,
    deleteService,
    setCurrentService,
    updateServiceStatus,
    getServicesByServerId,
    loadServices,
    loadServicesWithResetStatus
  }
})
