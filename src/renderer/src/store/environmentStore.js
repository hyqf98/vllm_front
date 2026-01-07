import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 环境管理 Store
 * 管理服务器上的 Python 环境（conda/uv/system）
 */
export const useEnvironmentStore = defineStore('environment', () => {
  // 环境列表
  const environments = ref([])

  // 当前选中的环境
  const currentEnvironment = ref(null)

  // 数据模块名称
  const DATA_MODULE = 'environments'

  /**
   * 添加环境
   * @param {Object} environment - 环境配置
   * @param {string} environment.serverId - 所属服务器ID
   * @param {string} environment.name - 环境名称
   * @param {string} environment.type - 环境类型 (conda | uv | system)
   * @param {string} environment.path - 环境路径
   * @param {string} environment.pythonPath - Python 可执行文件路径
   * @param {string} environment.pipPath - pip 可执行文件路径
   */
  const addEnvironment = async (environment) => {
    const newEnvironment = {
      ...environment,
      id: environment.id || Date.now().toString(),
      createdAt: new Date().toISOString()
    }
    environments.value.push(newEnvironment)
    await saveEnvironments()
    return newEnvironment
  }

  /**
   * 更新环境配置
   */
  const updateEnvironment = async (id, updates) => {
    const index = environments.value.findIndex(e => e.id === id)
    if (index !== -1) {
      environments.value[index] = { ...environments.value[index], ...updates }
      await saveEnvironments()
    }
  }

  /**
   * 删除环境
   */
  const deleteEnvironment = async (id) => {
    const index = environments.value.findIndex(e => e.id === id)
    if (index !== -1) {
      environments.value.splice(index, 1)
      if (currentEnvironment.value?.id === id) {
        currentEnvironment.value = null
      }
      await saveEnvironments()
    }
  }

  /**
   * 设置当前环境
   */
  const setCurrentEnvironment = (environment) => {
    currentEnvironment.value = environment
  }

  /**
   * 根据服务器ID获取环境列表
   */
  const getEnvironmentsByServerId = (serverId) => {
    return environments.value.filter(e => e.serverId === serverId)
  }

  /**
   * 根据环境ID获取环境
   */
  const getEnvironmentById = (id) => {
    return environments.value.find(e => e.id === id)
  }

  /**
   * 保存环境列表到持久化存储
   */
  const saveEnvironments = async () => {
    try {
      // 将对象转换为可序列化的纯 JSON
      const rawData = environments.value.map(env => ({
        id: env.id,
        serverId: env.serverId,
        name: env.name,
        type: env.type,
        path: env.path,
        pythonPath: env.pythonPath,
        pipPath: env.pipPath,
        description: env.description || '',
        createdAt: env.createdAt
      }))

      // 使用 JSON 序列化/反序列化来深拷贝，移除任何不可序列化的数据
      const serializedData = JSON.parse(JSON.stringify(rawData))

      const result = await window.api.data.write(DATA_MODULE, serializedData)

      // 检查写入结果
      if (!result.success) {
        throw new Error(result.error || '写入数据失败')
      }

      console.log(`保存环境列表成功: ${serializedData.length} 个环境`)
    } catch (error) {
      console.error('保存环境列表失败:', error)
      throw error // 重新抛出错误
    }
  }

  /**
   * 从持久化存储加载环境列表
   */
  const loadEnvironments = async () => {
    try {
      const result = await window.api.data.read(DATA_MODULE, [])
      if (result.success && result.data) {
        environments.value = result.data
      }
    } catch (error) {
      console.error('加载环境列表失败:', error)
    }
  }

  /**
   * 清理引用不存在服务器的环境（脏数据）
   * @param {Array} serverIds - 当前有效的服务器ID列表
   */
  const cleanOrphanEnvironments = async (serverIds) => {
    const orphans = environments.value.filter(env => !serverIds.includes(env.serverId))

    if (orphans.length > 0) {
      console.log(`发现 ${orphans.length} 个孤立环境，开始清理...`)

      for (const orphan of orphans) {
        await deleteEnvironment(orphan.id)
      }

      console.log(`已清理 ${orphans.length} 个孤立环境`)
      return orphans.length
    }

    return 0
  }

  return {
    environments,
    currentEnvironment,
    addEnvironment,
    updateEnvironment,
    deleteEnvironment,
    setCurrentEnvironment,
    getEnvironmentsByServerId,
    getEnvironmentById,
    loadEnvironments,
    cleanOrphanEnvironments
  }
})
